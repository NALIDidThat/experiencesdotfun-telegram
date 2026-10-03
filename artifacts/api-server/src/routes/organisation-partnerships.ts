import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Router, type IRouter } from "express";
import {
  CreateOrganisationPartnershipBody,
} from "@workspace/api-zod";
import {
  db,
  organisationPartnershipsTable,
  usersTable,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";

const router: IRouter = Router();
router.use(requireTelegramUser);

const requesterProfile = alias(usersTable, "organisation_partnership_requester");
const recipientProfile = alias(usersTable, "organisation_partnership_recipient");

type PartnershipDirection = "incoming" | "outgoing";

function partnerSummary(user: {
  id: number;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function requireOrganisation(userType: string | null) {
  return userType === "organisation";
}

function responseFor(
  partnership: typeof organisationPartnershipsTable.$inferSelect,
  partner: Parameters<typeof partnerSummary>[0],
  currentUserId: number,
) {
  const direction: PartnershipDirection =
    partnership.requesterUserId === currentUserId ? "outgoing" : "incoming";
  return {
    id: partnership.id,
    partner: partnerSummary(partner),
    status: partnership.status,
    direction,
    createdAt: partnership.createdAt.toISOString(),
  };
}

router.get("/", async (req, res): Promise<void> => {
  const user = currentUser(req);
  if (!requireOrganisation(user.userType)) {
    res.status(409).json({ message: "Only organisation profiles can manage organisation partnerships." });
    return;
  }

  const rows = await db
    .select({
      partnership: organisationPartnershipsTable,
      requester: requesterProfile,
      recipient: recipientProfile,
    })
    .from(organisationPartnershipsTable)
    .innerJoin(
      requesterProfile,
      eq(requesterProfile.id, organisationPartnershipsTable.requesterUserId),
    )
    .innerJoin(
      recipientProfile,
      eq(recipientProfile.id, organisationPartnershipsTable.recipientUserId),
    )
    .where(
      and(
        or(
          eq(organisationPartnershipsTable.requesterUserId, user.id),
          eq(organisationPartnershipsTable.recipientUserId, user.id),
        ),
        inArray(organisationPartnershipsTable.status, ["pending", "active"]),
      ),
    )
    .orderBy(desc(organisationPartnershipsTable.createdAt), desc(organisationPartnershipsTable.id));

  res.json(
    rows.map(({ partnership, requester, recipient }) =>
      responseFor(
        partnership,
        partnership.requesterUserId === user.id ? recipient : requester,
        user.id,
      ),
    ),
  );
});

router.post("/", async (req, res): Promise<void> => {
  const requester = currentUser(req);
  if (!requireOrganisation(requester.userType)) {
    res.status(409).json({ message: "Only organisation profiles can manage organisation partnerships." });
    return;
  }

  const parsed = CreateOrganisationPartnershipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter the organisation profile's username." });
    return;
  }

  const username = parsed.data.username.trim().replace(/^@+/, "").toLowerCase();
  const recipient = await db.query.usersTable.findFirst({
    where: and(
      eq(usersTable.userType, "organisation"),
      sql`lower(${usersTable.username}) = ${username}`,
    ),
  });
  if (!recipient) {
    res.status(404).json({ message: "That organisation profile could not be found." });
    return;
  }
  if (recipient.id === requester.id || recipient.telegramId === requester.telegramId) {
    res.status(409).json({ message: "You cannot partner with your own organisation account." });
    return;
  }

  const lowerId = Math.min(requester.id, recipient.id);
  const higherId = Math.max(requester.id, recipient.id);
  const pairCondition = or(
    and(
      eq(organisationPartnershipsTable.requesterUserId, requester.id),
      eq(organisationPartnershipsTable.recipientUserId, recipient.id),
    ),
    and(
      eq(organisationPartnershipsTable.requesterUserId, recipient.id),
      eq(organisationPartnershipsTable.recipientUserId, requester.id),
    ),
  );
  const outcome = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${lowerId}, ${higherId})`);
    const [existing] = await transaction
      .select()
      .from(organisationPartnershipsTable)
      .where(pairCondition)
      .limit(1);

    if (existing?.status === "pending" || existing?.status === "active") {
      return { kind: "exists" as const };
    }

    const [partnership] = existing
      ? await transaction
          .update(organisationPartnershipsTable)
          .set({
            requesterUserId: requester.id,
            recipientUserId: recipient.id,
            status: "pending",
            createdAt: new Date(),
            acceptedAt: null,
            endedAt: null,
          })
          .where(eq(organisationPartnershipsTable.id, existing.id))
          .returning()
      : await transaction
          .insert(organisationPartnershipsTable)
          .values({ requesterUserId: requester.id, recipientUserId: recipient.id })
          .returning();

    if (!partnership) throw new Error("Unable to create organisation partnership request.");
    return { kind: "saved" as const, partnership };
  });

  if (outcome.kind === "exists") {
    res.status(409).json({ message: "A pending request or active partnership already exists." });
    return;
  }
  res.status(201).json(responseFor(outcome.partnership, recipient, requester.id));
});

async function updatePartnership(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  action: "accept" | "decline" | "end",
): Promise<void> {
  const user = currentUser(req);
  if (!requireOrganisation(user.userType)) {
    res.status(409).json({ message: "Only organisation profiles can manage organisation partnerships." });
    return;
  }

  const partnershipId = Number(req.params.partnershipId);
  if (!Number.isSafeInteger(partnershipId) || partnershipId < 1) {
    res.status(400).json({ message: "Invalid partnership id." });
    return;
  }

  const status = action === "accept" ? "active" : action === "decline" ? "declined" : "ended";
  const now = new Date();
  const actionCondition =
    action === "end"
      ? and(
          or(
            eq(organisationPartnershipsTable.requesterUserId, user.id),
            eq(organisationPartnershipsTable.recipientUserId, user.id),
          ),
          eq(organisationPartnershipsTable.status, "active"),
        )
      : and(
          eq(organisationPartnershipsTable.recipientUserId, user.id),
          eq(organisationPartnershipsTable.status, "pending"),
        );
  const [partnership] = await db
    .update(organisationPartnershipsTable)
    .set({
      status,
      acceptedAt: action === "accept" ? now : undefined,
      endedAt: action === "end" ? now : action === "decline" ? null : undefined,
    })
    .where(and(eq(organisationPartnershipsTable.id, partnershipId), actionCondition))
    .returning();

  if (!partnership) {
    res.status(404).json({ message: "Organisation partnership request not found or no longer available." });
    return;
  }
  const partnerId =
    partnership.requesterUserId === user.id
      ? partnership.recipientUserId
      : partnership.requesterUserId;
  const partner = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, partnerId),
  });
  if (!partner) {
    res.status(404).json({ message: "Organisation profile not found." });
    return;
  }
  res.json(responseFor(partnership, partner, user.id));
}

router.post("/:partnershipId/accept", async (req, res): Promise<void> => {
  await updatePartnership(req, res, "accept");
});
router.post("/:partnershipId/decline", async (req, res): Promise<void> => {
  await updatePartnership(req, res, "decline");
});
router.post("/:partnershipId/end", async (req, res): Promise<void> => {
  await updatePartnership(req, res, "end");
});

export default router;