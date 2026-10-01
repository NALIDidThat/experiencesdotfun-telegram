import { and, count, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { alias } from "drizzle-orm/pg-core";
import {
  AcceptAccountabilityInvitationParams,
  ConfirmAccountabilityCheckInParams,
  CreateAccountabilityCheckInBody,
  CreateAccountabilityCheckInParams,
  CreateAccountabilityInvitationBody,
  CreateAccountabilityCommitmentBody,
  DeclineAccountabilityInvitationParams,
  EndAccountabilityPartnershipParams,
  MarkAccountabilityNotificationReadParams,
  SendAccountabilityEncouragementBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  accountabilityCheckInsTable,
  accountabilityCommitmentsTable,
  accountabilityEventsTable,
  accountabilityPartnershipsTable,
  feedActivityEventsTable,
  friendshipsTable,
  usersTable,
  type User,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { automaticActivityVisibility } from "../lib/feed-privacy";
import { hasSameTelegramIdentity } from "../lib/telegram-identity";
import { escapeTelegramHtml, sendTelegramMessage } from "../lib/telegram";

const router: IRouter = Router();
router.use(requireTelegramUser);

const eventActor = alias(usersTable, "accountability_event_actor");
const checkInVerifier = alias(usersTable, "accountability_checkin_verifier");
const commitmentCreator = alias(usersTable, "accountability_commitment_creator");
const commitmentAssignee = alias(usersTable, "accountability_commitment_assignee");

type AccountabilityTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AccountabilityEventType =
  | "partner_invite"
  | "partner_accepted"
  | "partner_declined"
  | "partnership_ended"
  | "commitment_created"
  | "check_in_completed"
  | "check_in_partial"
  | "check_in_missed"
  | "check_in_rescheduled"
  | "check_in_confirmed"
  | "encouragement_received";

function error(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

function participantForRequest(req: Request, res: Response): User | undefined {
  const user = currentUser(req);
  if (user.userType === "participant") return user;
  if (user.userType === null) {
    res.status(409).json({
      code: "ACCOUNT_TYPE_REQUIRED",
      message: "Choose a participant profile before using accountability partners.",
    });
    return undefined;
  }
  error(res, 403, "Accountability partners are available to participant profiles.");
  return undefined;
}

function participantSummary(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function sendPrivateTelegramNotice(user: User | undefined, message: string) {
  if (!user || !/^\d+$/.test(user.telegramId)) return;
  void sendTelegramMessage(user.telegramId, message);
}

async function lockParticipants(tx: AccountabilityTx, firstUserId: number, secondUserId: number) {
  const lowId = Math.min(firstUserId, secondUserId);
  const highId = Math.max(firstUserId, secondUserId);
  await tx.execute(sql`
    SELECT id FROM users
    WHERE id IN (${lowId}, ${highId})
    ORDER BY id
    FOR UPDATE
  `);
}

function partnershipContainsEitherUser(firstUserId: number, secondUserId?: number) {
  const first = or(
    eq(accountabilityPartnershipsTable.requesterUserId, firstUserId),
    eq(accountabilityPartnershipsTable.recipientUserId, firstUserId),
  );
  if (secondUserId === undefined) return first;
  return or(
    first,
    eq(accountabilityPartnershipsTable.requesterUserId, secondUserId),
    eq(accountabilityPartnershipsTable.recipientUserId, secondUserId),
  );
}

function partnershipBetween(firstUserId: number, secondUserId: number) {
  return or(
    and(
      eq(accountabilityPartnershipsTable.requesterUserId, firstUserId),
      eq(accountabilityPartnershipsTable.recipientUserId, secondUserId),
    ),
    and(
      eq(accountabilityPartnershipsTable.requesterUserId, secondUserId),
      eq(accountabilityPartnershipsTable.recipientUserId, firstUserId),
    ),
  );
}

async function createEvent(
  tx: AccountabilityTx,
  input: {
    partnershipId: number;
    actorUserId: number;
    recipientUserId: number;
    commitmentId?: number | null;
    checkInId?: number | null;
    type: AccountabilityEventType;
    title: string;
    message: string;
  },
) {
  await tx.insert(accountabilityEventsTable).values({
    partnershipId: input.partnershipId,
    actorUserId: input.actorUserId,
    recipientUserId: input.recipientUserId,
    commitmentId: input.commitmentId ?? null,
    checkInId: input.checkInId ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
  });
}

function checkInResponse(checkIn: typeof accountabilityCheckInsTable.$inferSelect, confirmedBy: User | null) {
  return {
    id: checkIn.id,
    commitmentId: checkIn.commitmentId,
    userId: checkIn.userId,
    status: checkIn.status,
    note: checkIn.note,
    verificationStatus: checkIn.verificationStatus,
    confirmedBy: confirmedBy ? participantSummary(confirmedBy) : null,
    createdAt: checkIn.createdAt.toISOString(),
  };
}

async function eventResponses(where: SQL<unknown> | undefined, currentUserId: number, limit: number) {
  const rows = await db
    .select({
      event: accountabilityEventsTable,
      actor: eventActor,
      commitment: accountabilityCommitmentsTable,
      checkIn: accountabilityCheckInsTable,
      confirmedBy: checkInVerifier,
    })
    .from(accountabilityEventsTable)
    .innerJoin(eventActor, eq(eventActor.id, accountabilityEventsTable.actorUserId))
    .leftJoin(
      accountabilityCommitmentsTable,
      eq(accountabilityCommitmentsTable.id, accountabilityEventsTable.commitmentId),
    )
    .leftJoin(
      accountabilityCheckInsTable,
      eq(accountabilityCheckInsTable.id, accountabilityEventsTable.checkInId),
    )
    .leftJoin(checkInVerifier, eq(checkInVerifier.id, accountabilityCheckInsTable.verifiedByUserId))
    .where(where)
    .orderBy(desc(accountabilityEventsTable.createdAt))
    .limit(limit);

  return rows.map(({ event, actor, commitment, checkIn, confirmedBy }) => ({
    id: event.id,
    type: event.type,
    title: event.title,
    message: event.message,
    actor: participantSummary(actor),
    commitmentId: event.commitmentId,
    commitmentTitle: commitment?.title ?? null,
    checkIn: checkIn ? checkInResponse(checkIn, confirmedBy) : null,
    readAt: event.readAt?.toISOString() ?? null,
    isUnread: event.recipientUserId === currentUserId && event.readAt === null,
    createdAt: event.createdAt.toISOString(),
  }));
}

async function hasActivePartnership(tx: AccountabilityTx, firstUserId: number, secondUserId?: number) {
  const [active] = await tx
    .select({ id: accountabilityPartnershipsTable.id })
    .from(accountabilityPartnershipsTable)
    .where(
      and(
        eq(accountabilityPartnershipsTable.status, "active"),
        partnershipContainsEitherUser(firstUserId, secondUserId),
      ),
    )
    .limit(1);
  return Boolean(active);
}

async function activePartnershipForUser(userId: number, partnershipId?: number) {
  const conditions = [
    eq(accountabilityPartnershipsTable.status, "active"),
    partnershipContainsEitherUser(userId),
  ];
  if (partnershipId !== undefined) conditions.push(eq(accountabilityPartnershipsTable.id, partnershipId));
  const [partnership] = await db
    .select()
    .from(accountabilityPartnershipsTable)
    .where(and(...conditions))
    .limit(1);
  return partnership;
}

async function dashboardFor(user: User) {
  const now = new Date();
  await db
    .update(accountabilityPartnershipsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(accountabilityPartnershipsTable.status, "pending"),
        lte(accountabilityPartnershipsTable.expiresAt, now),
        partnershipContainsEitherUser(user.id),
      ),
    );

  const activeRows = await db
    .select({ partnership: accountabilityPartnershipsTable, partner: usersTable })
    .from(accountabilityPartnershipsTable)
    .innerJoin(
      usersTable,
      or(
        and(
          eq(accountabilityPartnershipsTable.requesterUserId, user.id),
          eq(usersTable.id, accountabilityPartnershipsTable.recipientUserId),
        ),
        and(
          eq(accountabilityPartnershipsTable.recipientUserId, user.id),
          eq(usersTable.id, accountabilityPartnershipsTable.requesterUserId),
        ),
      ),
    )
    .where(
      and(
        eq(accountabilityPartnershipsTable.status, "active"),
        partnershipContainsEitherUser(user.id),
      ),
    )
    .orderBy(desc(accountabilityPartnershipsTable.acceptedAt))
    .limit(2);

  const active = activeRows[0];
  const incomingRows = await db
    .select({ partnership: accountabilityPartnershipsTable, user: usersTable })
    .from(accountabilityPartnershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, accountabilityPartnershipsTable.requesterUserId))
    .where(
      and(
        eq(accountabilityPartnershipsTable.recipientUserId, user.id),
        eq(accountabilityPartnershipsTable.status, "pending"),
        gt(accountabilityPartnershipsTable.expiresAt, now),
      ),
    )
    .orderBy(desc(accountabilityPartnershipsTable.createdAt));
  const outgoingRows = await db
    .select({ partnership: accountabilityPartnershipsTable, user: usersTable })
    .from(accountabilityPartnershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, accountabilityPartnershipsTable.recipientUserId))
    .where(
      and(
        eq(accountabilityPartnershipsTable.requesterUserId, user.id),
        eq(accountabilityPartnershipsTable.status, "pending"),
        gt(accountabilityPartnershipsTable.expiresAt, now),
      ),
    )
    .orderBy(desc(accountabilityPartnershipsTable.createdAt));

  const incomingInvitations = incomingRows.map(({ partnership, user: inviter }) => ({
    id: partnership.id,
    user: participantSummary(inviter),
    createdAt: partnership.createdAt.toISOString(),
    expiresAt: partnership.expiresAt.toISOString(),
  }));
  const outgoingInvitations = outgoingRows.map(({ partnership, user: invitee }) => ({
    id: partnership.id,
    user: participantSummary(invitee),
    createdAt: partnership.createdAt.toISOString(),
    expiresAt: partnership.expiresAt.toISOString(),
  }));

  let commitments: Array<Record<string, unknown>> = [];
  let activity: Array<Record<string, unknown>> = [];
  if (active) {
    const commitmentRows = await db
      .select({
        commitment: accountabilityCommitmentsTable,
        createdBy: commitmentCreator,
        assignedTo: commitmentAssignee,
      })
      .from(accountabilityCommitmentsTable)
      .innerJoin(
        commitmentCreator,
        eq(commitmentCreator.id, accountabilityCommitmentsTable.createdByUserId),
      )
      .innerJoin(
        commitmentAssignee,
        eq(commitmentAssignee.id, accountabilityCommitmentsTable.assignedUserId),
      )
      .where(eq(accountabilityCommitmentsTable.partnershipId, active.partnership.id))
      .orderBy(desc(accountabilityCommitmentsTable.createdAt))
      .limit(30);
    const commitmentIds = commitmentRows.map(({ commitment }) => commitment.id);
    const checkInRows = commitmentIds.length
      ? await db
          .select({ checkIn: accountabilityCheckInsTable, confirmedBy: checkInVerifier })
          .from(accountabilityCheckInsTable)
          .leftJoin(checkInVerifier, eq(checkInVerifier.id, accountabilityCheckInsTable.verifiedByUserId))
          .where(inArray(accountabilityCheckInsTable.commitmentId, commitmentIds))
          .orderBy(desc(accountabilityCheckInsTable.createdAt))
      : [];
    const latestCheckIns = new Map<number, (typeof checkInRows)[number]>();
    for (const row of checkInRows) {
      if (!latestCheckIns.has(row.checkIn.commitmentId)) latestCheckIns.set(row.checkIn.commitmentId, row);
    }
    commitments = commitmentRows.map(({ commitment, createdBy, assignedTo }) => {
      const latest = latestCheckIns.get(commitment.id);
      return {
        id: commitment.id,
        title: commitment.title,
        description: commitment.description,
        createdBy: participantSummary(createdBy),
        assignedTo: participantSummary(assignedTo),
        targetValue: commitment.targetValue,
        currentValue: commitment.currentValue,
        deadline: commitment.deadline,
        status: commitment.status,
        verificationStatus: commitment.verificationStatus,
        latestCheckIn: latest ? checkInResponse(latest.checkIn, latest.confirmedBy) : null,
        createdAt: commitment.createdAt.toISOString(),
        completedAt: commitment.completedAt?.toISOString() ?? null,
      };
    });
    activity = await eventResponses(
      eq(accountabilityEventsTable.partnershipId, active.partnership.id),
      user.id,
      30,
    );
  }

  const notifications = await eventResponses(
    eq(accountabilityEventsTable.recipientUserId, user.id),
    user.id,
    20,
  );
  const [unread] = await db
    .select({ value: count() })
    .from(accountabilityEventsTable)
    .where(
      and(
        eq(accountabilityEventsTable.recipientUserId, user.id),
        isNull(accountabilityEventsTable.readAt),
      ),
    );

  return {
    activePartner: active
      ? {
          partnershipId: active.partnership.id,
          partner: participantSummary(active.partner),
          acceptedAt: active.partnership.acceptedAt?.toISOString() ?? active.partnership.createdAt.toISOString(),
        }
      : null,
    incomingInvitations,
    outgoingInvitations,
    commitments,
    activity,
    notifications,
    unreadCount: unread?.value ?? 0,
  };
}

router.get("/", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const activeRows = await db
    .select({ id: accountabilityPartnershipsTable.id })
    .from(accountabilityPartnershipsTable)
    .where(
      and(
        eq(accountabilityPartnershipsTable.status, "active"),
        partnershipContainsEitherUser(user.id),
      ),
    )
    .limit(2);
  if (activeRows.length > 1) {
    error(res, 500, "Your active partner record needs support. Please try again later.");
    return;
  }
  res.json(await dashboardFor(user));
});

router.post("/invitations", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = CreateAccountabilityInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Choose a friend to invite.");
    return;
  }

  const invitationExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const result = await db.transaction(async (tx) => {
    await lockParticipants(tx, user.id, parsed.data.friendUserId);
    const [friend] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.friendUserId))
      .limit(1);
    if (!friend || friend.userType !== "participant") return { outcome: "friend_missing" as const };
    if (hasSameTelegramIdentity(user, friend)) return { outcome: "same_identity" as const };

    const [friendship] = await tx
      .select({ id: friendshipsTable.id })
      .from(friendshipsTable)
      .where(
        and(
          eq(friendshipsTable.status, "accepted"),
          or(
            and(
              eq(friendshipsTable.requesterUserId, user.id),
              eq(friendshipsTable.recipientUserId, friend.id),
            ),
            and(
              eq(friendshipsTable.requesterUserId, friend.id),
              eq(friendshipsTable.recipientUserId, user.id),
            ),
          ),
        ),
      )
      .limit(1);
    if (!friendship) return { outcome: "friendship_required" as const };
    if (await hasActivePartnership(tx, user.id, friend.id)) return { outcome: "already_paired" as const };

    const [existing] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(partnershipBetween(user.id, friend.id))
      .limit(1);
    if (existing?.status === "active") return { outcome: "already_paired" as const };
    if (existing?.status === "pending" && existing.expiresAt > new Date()) {
      return { outcome: "pending" as const };
    }

    const [partnership] = existing
      ? await tx
          .update(accountabilityPartnershipsTable)
          .set({
            requesterUserId: user.id,
            recipientUserId: friend.id,
            status: "pending",
            createdAt: new Date(),
            expiresAt: invitationExpiry,
            acceptedAt: null,
            endedAt: null,
          })
          .where(eq(accountabilityPartnershipsTable.id, existing.id))
          .returning()
      : await tx
          .insert(accountabilityPartnershipsTable)
          .values({
            requesterUserId: user.id,
            recipientUserId: friend.id,
            status: "pending",
            expiresAt: invitationExpiry,
          })
          .returning();
    if (!partnership) throw new Error("Unable to create an accountability invitation.");

    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: friend.id,
      type: "partner_invite",
      title: "Partner invitation",
      message: `${user.name} invited you to be their accountability partner.`,
    });
    return { outcome: "created" as const, friend };
  });

  if (result.outcome === "friend_missing") {
    error(res, 404, "That participant could not be found.");
    return;
  }
  if (result.outcome === "same_identity") {
    error(res, 409, "You can’t partner with another profile linked to your Telegram account.");
    return;
  }
  if (result.outcome === "friendship_required") {
    error(res, 409, "You can only invite an accepted friend. Add them as a friend first.");
    return;
  }
  if (result.outcome === "already_paired") {
    error(res, 409, "You or your friend already has an active accountability partner.");
    return;
  }
  if (result.outcome === "pending") {
    error(res, 409, "An accountability invitation is already waiting for a reply.");
    return;
  }
  sendPrivateTelegramNotice(
    result.friend,
    "You have a new accountability partner invitation. Open Experiences.fun to accept or decline it.",
  );
  res.status(201).json({ success: true, message: "Accountability invitation sent." });
});

router.post("/invitations/:invitationId/accept", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = AcceptAccountabilityInvitationParams.safeParse({
    invitationId: Number(req.params.invitationId),
  });
  if (!parsed.success) {
    error(res, 400, "That invitation is not valid.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [beforeLock] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, parsed.data.invitationId),
          eq(accountabilityPartnershipsTable.recipientUserId, user.id),
          eq(accountabilityPartnershipsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!beforeLock) return { outcome: "not_found" as const };

    await lockParticipants(tx, beforeLock.requesterUserId, user.id);
    const [invitation] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, parsed.data.invitationId),
          eq(accountabilityPartnershipsTable.recipientUserId, user.id),
          eq(accountabilityPartnershipsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!invitation) return { outcome: "not_found" as const };
    if (invitation.expiresAt <= new Date()) {
      await tx
        .update(accountabilityPartnershipsTable)
        .set({ status: "expired" })
        .where(eq(accountabilityPartnershipsTable.id, invitation.id));
      return { outcome: "expired" as const };
    }
    const [requester] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, invitation.requesterUserId))
      .limit(1);
    if (!requester || requester.userType !== "participant") return { outcome: "not_found" as const };
    if (hasSameTelegramIdentity(user, requester)) return { outcome: "same_identity" as const };
    if (await hasActivePartnership(tx, user.id, requester.id)) return { outcome: "already_paired" as const };

    const [partnership] = await tx
      .update(accountabilityPartnershipsTable)
      .set({ status: "active", acceptedAt: new Date(), endedAt: null })
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, invitation.id),
          eq(accountabilityPartnershipsTable.status, "pending"),
        ),
      )
      .returning();
    if (!partnership) return { outcome: "not_found" as const };

    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: requester.id,
      type: "partner_accepted",
      title: "Partnership started",
      message: `${user.name} accepted your invitation. You’re now accountability partners.`,
    });
    return { outcome: "accepted" as const, requester };
  });

  if (result.outcome === "not_found") {
    error(res, 404, "That invitation is no longer available.");
    return;
  }
  if (result.outcome === "expired") {
    error(res, 409, "That invitation has expired. Ask your friend to send another one.");
    return;
  }
  if (result.outcome === "same_identity") {
    error(res, 409, "You can’t partner with another profile linked to your Telegram account.");
    return;
  }
  if (result.outcome === "already_paired") {
    error(res, 409, "You or the inviter already has an active accountability partner.");
    return;
  }
  sendPrivateTelegramNotice(
    result.requester,
    "Your accountability invitation was accepted. Open Experiences.fun to plan your first commitment.",
  );
  res.json({ success: true, message: "You’re now accountability partners." });
});

router.post("/invitations/:invitationId/decline", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = DeclineAccountabilityInvitationParams.safeParse({
    invitationId: Number(req.params.invitationId),
  });
  if (!parsed.success) {
    error(res, 400, "That invitation is not valid.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [beforeLock] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, parsed.data.invitationId),
          eq(accountabilityPartnershipsTable.recipientUserId, user.id),
          eq(accountabilityPartnershipsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (!beforeLock) return { outcome: "not_found" as const };
    await lockParticipants(tx, beforeLock.requesterUserId, user.id);
    const [invitation] = await tx
      .update(accountabilityPartnershipsTable)
      .set({ status: "declined" })
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, parsed.data.invitationId),
          eq(accountabilityPartnershipsTable.recipientUserId, user.id),
          eq(accountabilityPartnershipsTable.status, "pending"),
          gt(accountabilityPartnershipsTable.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!invitation) return { outcome: "not_found" as const };
    await createEvent(tx, {
      partnershipId: invitation.id,
      actorUserId: user.id,
      recipientUserId: invitation.requesterUserId,
      type: "partner_declined",
      title: "Invitation declined",
      message: `${user.name} declined your accountability invitation.`,
    });
    const [requester] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, invitation.requesterUserId))
      .limit(1);
    return { outcome: "declined" as const, requester };
  });
  if (result.outcome === "not_found") {
    error(res, 404, "That invitation is no longer available.");
    return;
  }
  sendPrivateTelegramNotice(result.requester, "Your accountability invitation was declined.");
  res.json({ success: true, message: "Invitation declined." });
});

router.post("/partnerships/:partnershipId/end", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = EndAccountabilityPartnershipParams.safeParse({
    partnershipId: Number(req.params.partnershipId),
  });
  if (!parsed.success) {
    error(res, 400, "That partnership is not valid.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [beforeLock] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, parsed.data.partnershipId),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!beforeLock) return { outcome: "not_found" as const };
    const partnerId =
      beforeLock.requesterUserId === user.id ? beforeLock.recipientUserId : beforeLock.requesterUserId;
    await lockParticipants(tx, user.id, partnerId);
    const [partnership] = await tx
      .update(accountabilityPartnershipsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, beforeLock.id),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .returning();
    if (!partnership) return { outcome: "not_found" as const };
    await tx
      .update(accountabilityCommitmentsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(accountabilityCommitmentsTable.partnershipId, partnership.id),
          eq(accountabilityCommitmentsTable.status, "active"),
        ),
      );
    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: partnerId,
      type: "partnership_ended",
      title: "Partnership ended",
      message: `${user.name} ended the accountability partnership.`,
    });
    const [partner] = await tx.select().from(usersTable).where(eq(usersTable.id, partnerId)).limit(1);
    return { outcome: "ended" as const, partner };
  });
  if (result.outcome === "not_found") {
    error(res, 404, "That active partnership could not be found.");
    return;
  }
  sendPrivateTelegramNotice(result.partner, "Your accountability partnership has ended.");
  res.json({ success: true, message: "Partnership ended." });
});

router.post("/commitments", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = CreateAccountabilityCommitmentBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Add a commitment title and choose who it is for.");
    return;
  }
  const title = parsed.data.title.trim();
  const description = parsed.data.description?.trim() || null;
  if (!title) {
    error(res, 400, "Add a commitment title.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [initialPartnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!initialPartnership) return { outcome: "no_partner" as const };
    const partnerId =
      initialPartnership.requesterUserId === user.id
        ? initialPartnership.recipientUserId
        : initialPartnership.requesterUserId;
    await lockParticipants(tx, user.id, partnerId);

    const [partnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialPartnership.id),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!partnership) return { outcome: "no_partner" as const };
    if (parsed.data.assignedUserId !== user.id && parsed.data.assignedUserId !== partnerId) {
      return { outcome: "invalid_assignee" as const };
    }
    const [assignee] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.assignedUserId))
      .limit(1);
    const [partner] = await tx.select().from(usersTable).where(eq(usersTable.id, partnerId)).limit(1);
    if (!assignee || !partner) return { outcome: "no_partner" as const };

    const [commitment] = await tx
      .insert(accountabilityCommitmentsTable)
      .values({
        partnershipId: partnership.id,
        createdByUserId: user.id,
        assignedUserId: assignee.id,
        title,
        description,
        targetValue: parsed.data.targetValue ?? 1,
        deadline: parsed.data.deadline?.toISOString().slice(0, 10) ?? null,
      })
      .returning();
    if (!commitment) throw new Error("Unable to create the shared commitment.");
    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: partner.id,
      commitmentId: commitment.id,
      type: "commitment_created",
      title: "A new commitment",
      message: `${user.name} added “${commitment.title}” to your shared plan.`,
    });
    return { outcome: "created" as const, commitment, assignee, partner, partnership };
  });
  if (result.outcome === "no_partner") {
    error(res, 409, "Create an active accountability partnership before adding commitments.");
    return;
  }
  if (result.outcome === "invalid_assignee") {
    error(res, 400, "A commitment can only be assigned to you or your accountability partner.");
    return;
  }
  sendPrivateTelegramNotice(result.partner, "A new shared commitment is ready in Experiences.fun. Open Friends & Partners to see it.");
  res.status(201).json({
    id: result.commitment.id,
    title: result.commitment.title,
    description: result.commitment.description,
    createdBy: participantSummary(user),
    assignedTo: participantSummary(result.assignee),
    targetValue: result.commitment.targetValue,
    currentValue: result.commitment.currentValue,
    deadline: result.commitment.deadline,
    status: result.commitment.status,
    verificationStatus: result.commitment.verificationStatus,
    latestCheckIn: null,
    createdAt: result.commitment.createdAt.toISOString(),
    completedAt: null,
  });
});

router.post("/commitments/:commitmentId/check-ins", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsedParams = CreateAccountabilityCheckInParams.safeParse({
    commitmentId: Number(req.params.commitmentId),
  });
  const parsedBody = CreateAccountabilityCheckInBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    error(res, 400, "Choose a check-in status and try again.");
    return;
  }
  const note = parsedBody.data.note?.trim() || null;

  const result = await db.transaction(async (tx) => {
    const [initialCommitment] = await tx
      .select()
      .from(accountabilityCommitmentsTable)
      .where(eq(accountabilityCommitmentsTable.id, parsedParams.data.commitmentId))
      .limit(1);
    if (!initialCommitment) return { outcome: "not_found" as const };
    const [initialPartnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialCommitment.partnershipId),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!initialPartnership) return { outcome: "not_found" as const };
    const partnerId =
      initialPartnership.requesterUserId === user.id
        ? initialPartnership.recipientUserId
        : initialPartnership.requesterUserId;
    await lockParticipants(tx, user.id, partnerId);

    const [partnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialPartnership.id),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    const [commitment] = await tx
      .select()
      .from(accountabilityCommitmentsTable)
      .where(
        and(
          eq(accountabilityCommitmentsTable.id, initialCommitment.id),
          eq(accountabilityCommitmentsTable.partnershipId, initialPartnership.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!partnership || !commitment) return { outcome: "not_found" as const };
    if (commitment.assignedUserId !== user.id) return { outcome: "not_assignee" as const };
    if (commitment.status !== "active") return { outcome: "not_active" as const };
    const [partner] = await tx.select().from(usersTable).where(eq(usersTable.id, partnerId)).limit(1);
    if (!partner) return { outcome: "not_found" as const };

    const [checkIn] = await tx
      .insert(accountabilityCheckInsTable)
      .values({
        partnershipId: partnership.id,
        commitmentId: commitment.id,
        userId: user.id,
        status: parsedBody.data.status,
        note,
        verificationStatus: "self_reported",
      })
      .returning();
    if (!checkIn) throw new Error("Unable to save the check-in.");

    const progress = commitment.currentValue + (checkIn.status === "completed" ? 1 : 0);
    const isComplete = checkIn.status === "completed" && progress >= commitment.targetValue;
    await tx
      .update(accountabilityCommitmentsTable)
      .set({
        currentValue: progress,
        status: isComplete ? "completed" : commitment.status,
        verificationStatus: checkIn.status === "completed" ? "self_reported" : commitment.verificationStatus,
        completedAt: isComplete ? new Date() : commitment.completedAt,
      })
      .where(eq(accountabilityCommitmentsTable.id, commitment.id));

    const feedVisibility = await automaticActivityVisibility(tx, user.id);
    await tx
      .insert(feedActivityEventsTable)
      .values({
        actorId: user.id,
        type: isComplete ? "accountability_goal_completed" : "accountability_checkin",
        targetType: "accountability",
        targetId: checkIn.id,
        metadata: { status: checkIn.status },
        visibility: feedVisibility,
        createdAt: checkIn.createdAt,
      })
      .onConflictDoNothing();

    const descriptions = {
      completed: {
        type: "check_in_completed" as const,
        title: "Commitment checked in",
        message: `${user.name} marked “${commitment.title}” complete. This is self-reported until confirmed.`,
      },
      partial: {
        type: "check_in_partial" as const,
        title: "Progress update",
        message: `${user.name} shared an update on “${commitment.title}”.`,
      },
      missed: {
        type: "check_in_missed" as const,
        title: "Check-in received",
        message: `${user.name} shared an update about “${commitment.title}”.`,
      },
      rescheduled: {
        type: "check_in_rescheduled" as const,
        title: "Check-in received",
        message: `${user.name} shared an update about “${commitment.title}”.`,
      },
    }[checkIn.status];
    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: partner.id,
      commitmentId: commitment.id,
      checkInId: checkIn.id,
      ...descriptions,
    });
    return { outcome: "created" as const, checkIn, partner };
  });

  if (result.outcome === "not_found") {
    error(res, 404, "That active commitment could not be found.");
    return;
  }
  if (result.outcome === "not_assignee") {
    error(res, 403, "Only the person assigned to this commitment can check in.");
    return;
  }
  if (result.outcome === "not_active") {
    error(res, 409, "This commitment is no longer active.");
    return;
  }
  sendPrivateTelegramNotice(result.partner, "Your accountability partner added a commitment check-in. Open Experiences.fun to see their update.");
  res.status(201).json(checkInResponse(result.checkIn, null));
});

router.post("/check-ins/:checkInId/confirm", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = ConfirmAccountabilityCheckInParams.safeParse({
    checkInId: Number(req.params.checkInId),
  });
  if (!parsed.success) {
    error(res, 400, "That check-in is not valid.");
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [initialCheckIn] = await tx
      .select()
      .from(accountabilityCheckInsTable)
      .where(eq(accountabilityCheckInsTable.id, parsed.data.checkInId))
      .limit(1);
    if (!initialCheckIn) return { outcome: "not_found" as const };
    const [initialPartnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialCheckIn.partnershipId),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!initialPartnership) return { outcome: "not_found" as const };
    const authorId =
      initialPartnership.requesterUserId === user.id
        ? initialPartnership.recipientUserId
        : initialPartnership.requesterUserId;
    if (initialCheckIn.userId !== authorId) return { outcome: "not_found" as const };
    await lockParticipants(tx, user.id, authorId);

    const [partnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialPartnership.id),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    const [checkIn] = await tx
      .select()
      .from(accountabilityCheckInsTable)
      .where(eq(accountabilityCheckInsTable.id, parsed.data.checkInId))
      .for("update")
      .limit(1);
    if (!partnership || !checkIn || checkIn.userId !== authorId) {
      return { outcome: "not_found" as const };
    }
    if (checkIn.status !== "completed" || checkIn.verificationStatus !== "self_reported") {
      return { outcome: "not_confirmable" as const };
    }
    const [author] = await tx.select().from(usersTable).where(eq(usersTable.id, authorId)).limit(1);
    const [commitment] = await tx
      .select()
      .from(accountabilityCommitmentsTable)
      .where(eq(accountabilityCommitmentsTable.id, checkIn.commitmentId))
      .for("update")
      .limit(1);
    if (!author || !commitment) return { outcome: "not_found" as const };
    if (hasSameTelegramIdentity(user, author)) return { outcome: "same_identity" as const };

    const [updated] = await tx
      .update(accountabilityCheckInsTable)
      .set({
        verificationStatus: "partner_confirmed",
        verifiedByUserId: user.id,
        verifiedAt: new Date(),
      })
      .where(
        and(
          eq(accountabilityCheckInsTable.id, checkIn.id),
          eq(accountabilityCheckInsTable.verificationStatus, "self_reported"),
        ),
      )
      .returning();
    if (!updated) return { outcome: "not_confirmable" as const };
    if (commitment.status === "completed" && commitment.currentValue >= commitment.targetValue) {
      await tx
        .update(accountabilityCommitmentsTable)
        .set({ verificationStatus: "partner_confirmed" })
        .where(eq(accountabilityCommitmentsTable.id, commitment.id));
    }
    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: author.id,
      commitmentId: commitment.id,
      checkInId: updated.id,
      type: "check_in_confirmed",
      title: "Completion confirmed",
      message: `${user.name} confirmed your check-in for “${commitment.title}”.`,
    });
    return { outcome: "confirmed" as const, checkIn: updated, author };
  });

  if (result.outcome === "not_found") {
    error(res, 404, "That check-in could not be found for your active partnership.");
    return;
  }
  if (result.outcome === "not_confirmable") {
    error(res, 409, "Only an unconfirmed, completed check-in can be confirmed.");
    return;
  }
  if (result.outcome === "same_identity") {
    error(res, 409, "You can’t confirm a check-in from another profile linked to your Telegram account.");
    return;
  }
  sendPrivateTelegramNotice(result.author, "Your accountability partner confirmed your check-in. This does not award Experience XP.");
  res.json(checkInResponse(result.checkIn, user));
});

const encouragementMessages = {
  keep_going: "Keep going — one small step still counts.",
  nearly_there: "You’re nearly there. I’m cheering you on.",
  proud_of_you: "Proud of the consistency you’re building.",
  lets_do_this: "Let’s get this done together.",
  join_me: "Want to do this experience together?",
} as const;

router.post("/encouragement", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = SendAccountabilityEncouragementBody.safeParse(req.body);
  if (!parsed.success) {
    error(res, 400, "Choose a preset or write a personal encouragement message.");
    return;
  }

  const hasPreset = parsed.data.message !== undefined;
  const hasCustomMessage = parsed.data.customMessage !== undefined;
  if (hasPreset === hasCustomMessage) {
    error(res, 400, "Choose one preset or write a personal encouragement message.");
    return;
  }
  const customMessage = parsed.data.customMessage?.trim();
  if (hasCustomMessage && !customMessage) {
    error(res, 400, "Write a message before sending it.");
    return;
  }
  const message = parsed.data.message
    ? encouragementMessages[parsed.data.message]
    : customMessage!;

  const result = await db.transaction(async (tx) => {
    const [initialPartnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    if (!initialPartnership) return { outcome: "no_partner" as const };
    const partnerId =
      initialPartnership.requesterUserId === user.id
        ? initialPartnership.recipientUserId
        : initialPartnership.requesterUserId;
    await lockParticipants(tx, user.id, partnerId);
    const [partnership] = await tx
      .select()
      .from(accountabilityPartnershipsTable)
      .where(
        and(
          eq(accountabilityPartnershipsTable.id, initialPartnership.id),
          eq(accountabilityPartnershipsTable.status, "active"),
          partnershipContainsEitherUser(user.id),
        ),
      )
      .limit(1);
    const [partner] = await tx.select().from(usersTable).where(eq(usersTable.id, partnerId)).limit(1);
    if (!partnership || !partner) return { outcome: "no_partner" as const };
    await createEvent(tx, {
      partnershipId: partnership.id,
      actorUserId: user.id,
      recipientUserId: partner.id,
      type: "encouragement_received",
      title: "A note from your partner",
      message,
    });
    return { outcome: "sent" as const, partner, message };
  });
  if (result.outcome === "no_partner") {
    error(res, 409, "You need an active accountability partner to send encouragement.");
    return;
  }
  sendPrivateTelegramNotice(
    result.partner,
    `Your accountability partner says: ${escapeTelegramHtml(result.message)}`,
  );
  res.status(201).json({ success: true, message: "Encouragement sent." });
});

router.patch("/notifications/:notificationId/read", async (req, res) => {
  const user = participantForRequest(req, res);
  if (!user) return;
  const parsed = MarkAccountabilityNotificationReadParams.safeParse({
    notificationId: Number(req.params.notificationId),
  });
  if (!parsed.success) {
    error(res, 400, "That notification is not valid.");
    return;
  }
  const [updated] = await db
    .update(accountabilityEventsTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(accountabilityEventsTable.id, parsed.data.notificationId),
        eq(accountabilityEventsTable.recipientUserId, user.id),
      ),
    )
    .returning({ id: accountabilityEventsTable.id });
  if (!updated) {
    error(res, 404, "That notification could not be found.");
    return;
  }
  res.json({ success: true, message: "Notification marked as read." });
});

export default router;