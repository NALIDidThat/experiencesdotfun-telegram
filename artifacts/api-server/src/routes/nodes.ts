import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  experiencesTable,
  nodeExperiencesTable,
  nodeMembershipsTable,
  nodesTable,
  nodeVerificationEventsTable,
  organisationsTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  isVerificationReviewer,
  isVerificationSelfReview,
  verificationReviewReasonError,
} from "../lib/organisation-verification-rules.mjs";

const router = Router();
const categories = ["environmental", "education", "community"] as const;
const roles = ["participant", "volunteer", "learner"] as const;
const reviewActions = ["approve", "reject", "needs_information", "suspend"] as const;
const draftFields = {
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  categories: z.array(z.enum(categories)).max(8).optional(),
  addressLine1: z.string().trim().max(180).nullable().optional(),
  addressLine2: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  postcode: z.string().trim().max(32).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  publicWebsite: z.string().url().max(500).nullable().optional(),
  publicContactEmail: z.string().email().max(320).nullable().optional(),
  visibility: z.enum(["public", "unlisted"]).optional(),
  approvalRequired: z.boolean().optional(),
};
const createNodeSchema = z.object(draftFields);
const updateNodeSchema = z.object({
  ...draftFields,
  name: draftFields.name.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Update at least one field.");
const reviewSchema = z.object({
  action: z.enum(reviewActions),
  note: z.string().trim().max(500).nullable().optional(),
});
const connectSchema = z.object({ role: z.enum(roles) });

let nodeSchemaPromise: Promise<boolean> | undefined;

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

async function ensureNodeSchema(res: Response): Promise<boolean> {
  try {
    nodeSchemaPromise ??= db.execute(sql`
      SELECT
        to_regclass('public.nodes') IS NOT NULL AS nodes_table,
        to_regclass('public.node_memberships') IS NOT NULL AS memberships_table,
        to_regclass('public.node_verification_events') IS NOT NULL AS verification_events_table,
        to_regclass('public.node_experiences') IS NOT NULL AS node_experiences_table
    `).then((result) => {
      const row = result.rows[0] as {
        nodes_table?: boolean;
        memberships_table?: boolean;
        verification_events_table?: boolean;
        node_experiences_table?: boolean;
      } | undefined;
      return Boolean(row?.nodes_table && row.memberships_table && row.verification_events_table && row.node_experiences_table);
    });
    if (await nodeSchemaPromise) return true;
    nodeSchemaPromise = undefined;
  } catch {
    nodeSchemaPromise = undefined;
  }
  sendError(res, 503, "The Node Network is not available until its database migration is applied.");
  return false;
}

function parseId(value: string | undefined) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "node";
}

function serializeNode(record: {
  node: typeof nodesTable.$inferSelect;
  organisation: typeof organisationsTable.$inferSelect;
}, includeReviewerNotes = false) {
  const { node, organisation } = record;
  return {
    id: node.id,
    organisationId: organisation.id,
    organisationName: organisation.name,
    organisationType: organisation.organisationType,
    organisationVerified: organisation.verificationStatus === "verified" || organisation.verified,
    organisationDescription: organisation.description,
    organisationCity: organisation.city,
    organisationCountry: organisation.country,
    name: node.name,
    slug: node.slug,
    description: node.description,
    categories: node.categories,
    addressLine1: node.addressLine1,
    addressLine2: node.addressLine2,
    city: node.city,
    country: node.country,
    postcode: node.postcode,
    latitude: node.latitude,
    longitude: node.longitude,
    publicWebsite: node.publicWebsite,
    publicContactEmail: node.publicContactEmail,
    visibility: node.visibility,
    approvalRequired: node.approvalRequired,
    verificationStatus: node.verificationStatus,
    ...(includeReviewerNotes ? { reviewerNotes: node.reviewerNotes } : {}),
    submittedAt: node.submittedAt?.toISOString() ?? null,
    verifiedAt: node.verifiedAt?.toISOString() ?? null,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

async function loadNode(nodeId: number) {
  const [record] = await db
    .select({ node: nodesTable, organisation: organisationsTable })
    .from(nodesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(eq(nodesTable.id, nodeId))
    .limit(1);
  return record;
}

async function getOwnedOrganisation(userId: number) {
  const [organisation] = await db.select().from(organisationsTable)
    .where(eq(organisationsTable.ownerUserId, userId)).limit(1);
  return organisation;
}

async function getOwnedNode(nodeId: number, userId: number) {
  const [record] = await db
    .select({ node: nodesTable, organisation: organisationsTable })
    .from(nodesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(and(eq(nodesTable.id, nodeId), eq(organisationsTable.ownerUserId, userId)))
    .limit(1);
  return record;
}

async function ownerOrError(req: Parameters<typeof currentUser>[0], res: Response) {
  const user = currentUser(req);
  if (user.userType !== "organisation") {
    sendError(res, 403, "An organisation profile is required.");
    return null;
  }
  const organisation = await getOwnedOrganisation(user.id);
  if (!organisation) sendError(res, 403, "An organisation profile is required.");
  return organisation ?? null;
}

router.use("/nodes", requireTelegramUser);
router.use("/organisations/nodes", requireTelegramUser);
router.use("/me/nodes", requireTelegramUser);
router.use("/admin/nodes", requireTelegramUser);

router.get("/nodes", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const city = typeof req.query.city === "string" ? req.query.city.trim().slice(0, 120) : "";
  const category = typeof req.query.category === "string" && categories.includes(req.query.category as typeof categories[number])
    ? req.query.category
    : null;
  const limitValue = Number(req.query.limit);
  const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(100, limitValue)) : 60;
  const filters = [
    eq(nodesTable.verificationStatus, "verified"),
    eq(nodesTable.visibility, "public"),
  ];
  if (city) filters.push(ilike(nodesTable.city, city));
  if (category) filters.push(sql`${nodesTable.categories} @> ARRAY[${category}]::text[]`);
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(
      ilike(nodesTable.name, pattern),
      ilike(nodesTable.description, pattern),
      ilike(nodesTable.city, pattern),
      ilike(organisationsTable.name, pattern),
    )!);
  }
  const records = await db.select({ node: nodesTable, organisation: organisationsTable })
    .from(nodesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(and(...filters))
    .orderBy(asc(nodesTable.city), asc(nodesTable.name))
    .limit(limit);
  res.json(records.map((record) => serializeNode(record)));
});

router.get("/nodes/:nodeId", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const record = await loadNode(nodeId);
  if (
    !record ||
    record.node.verificationStatus !== "verified" ||
    record.node.visibility !== "public"
  ) {
    return sendError(res, 404, "This Node is not publicly available.");
  }
  const user = currentUser(req);
  const [memberTotal, experienceList, membership] = await Promise.all([
    db.select({ total: count() }).from(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.nodeId, nodeId), eq(nodeMembershipsTable.status, "active"))),
    db.select({
      id: experiencesTable.id,
      title: experiencesTable.title,
      description: experiencesTable.description,
      category: experiencesTable.category,
      date: experiencesTable.date,
      startTime: experiencesTable.startTime,
      endTime: experiencesTable.endTime,
      location: experiencesTable.location,
      city: experiencesTable.city,
      status: experiencesTable.status,
    }).from(nodeExperiencesTable)
      .innerJoin(experiencesTable, eq(experiencesTable.id, nodeExperiencesTable.experienceId))
      .where(and(
        eq(nodeExperiencesTable.nodeId, nodeId),
        inArray(experiencesTable.status, ["published", "full"]),
      ))
      .orderBy(asc(experiencesTable.date), asc(experiencesTable.startTime))
      .limit(20),
    db.select({
      participationRole: nodeMembershipsTable.participationRole,
      status: nodeMembershipsTable.status,
      isPrimary: nodeMembershipsTable.isPrimary,
    }).from(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.nodeId, nodeId), eq(nodeMembershipsTable.userId, user.id)))
      .limit(1),
  ]);
  res.json({
    node: serializeNode(record),
    stats: {
      connectedParticipants: Number(memberTotal[0]?.total ?? 0),
      publishedExperiences: experienceList.length,
    },
    experiences: experienceList,
    membership: membership[0] ?? null,
  });
});

router.get("/organisations/nodes", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const organisation = await ownerOrError(req, res);
  if (!organisation) return;
  const records = await db.select({ node: nodesTable, organisation: organisationsTable })
    .from(nodesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(eq(nodesTable.organisationId, organisation.id))
    .orderBy(desc(nodesTable.updatedAt));
  res.json(records.map((record) => serializeNode(record, true)));
});

router.post("/organisations/nodes", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const organisation = await ownerOrError(req, res);
  if (!organisation) return;
  const parsed = createNodeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message ?? "Check the Node details.");
  const user = currentUser(req);
  const [node] = await db.transaction(async (transaction) => {
    const [created] = await transaction.insert(nodesTable).values({
      organisationId: organisation.id,
      name: parsed.data.name,
      slug: `${slugify(parsed.data.name)}-${randomUUID().slice(0, 8)}`,
      description: parsed.data.description ?? null,
      categories: parsed.data.categories ?? [],
      addressLine1: parsed.data.addressLine1 ?? null,
      addressLine2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city ?? null,
      country: parsed.data.country ?? null,
      postcode: parsed.data.postcode ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      publicWebsite: parsed.data.publicWebsite ?? null,
      publicContactEmail: parsed.data.publicContactEmail ?? null,
      visibility: parsed.data.visibility ?? "public",
      approvalRequired: parsed.data.approvalRequired ?? false,
    }).returning();
    await transaction.insert(nodeVerificationEventsTable).values({
      nodeId: created.id,
      actorUserId: user.id,
      eventType: "created",
      status: "draft",
    });
    return [created];
  });
  const record = await loadNode(node.id);
  res.status(201).json(serializeNode(record!, true));
});

router.patch("/organisations/nodes/:nodeId", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const organisation = await ownerOrError(req, res);
  if (!organisation) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const parsed = updateNodeSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message ?? "Check the Node details.");
  const existing = await getOwnedNode(nodeId, organisation.ownerUserId);
  if (!existing) return sendError(res, 404, "Node not found.");
  if (["pending", "under_review"].includes(existing.node.verificationStatus)) {
    return sendError(res, 409, "This Node is under review. Wait for the review outcome before editing it.");
  }
  const values = { ...parsed.data, updatedAt: new Date() };
  if (existing.node.verificationStatus === "verified") {
    Object.assign(values, { verificationStatus: "draft", verifiedAt: null, submittedAt: null });
  }
  const [updated] = await db.update(nodesTable).set(values)
    .where(eq(nodesTable.id, nodeId)).returning();
  await db.insert(nodeVerificationEventsTable).values({
    nodeId,
    actorUserId: currentUser(req).id,
    eventType: "updated",
    status: updated.verificationStatus,
  });
  const record = await loadNode(nodeId);
  res.json(serializeNode(record!, true));
});

router.post("/organisations/nodes/:nodeId/submit", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const organisation = await ownerOrError(req, res);
  if (!organisation) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const record = await getOwnedNode(nodeId, organisation.ownerUserId);
  if (!record) return sendError(res, 404, "Node not found.");
  if (!["draft", "rejected", "needs_information"].includes(record.node.verificationStatus)) {
    return sendError(res, 409, "This Node cannot be submitted in its current status.");
  }
  const node = record.node;
  if (
    !node.description?.trim()
    || !node.categories.length
    || !node.addressLine1?.trim()
    || !node.city?.trim()
    || !node.country?.trim()
    || node.latitude === null
    || node.longitude === null
  ) {
    return sendError(res, 400, "Add a description, category, full location, and map pin before submitting.");
  }
  const submittedAt = new Date();
  const [updated] = await db.transaction(async (transaction) => {
    const [saved] = await transaction.update(nodesTable).set({
      verificationStatus: "pending",
      reviewerNotes: null,
      submittedAt,
      verifiedAt: null,
      updatedAt: submittedAt,
    }).where(eq(nodesTable.id, nodeId)).returning();
    await transaction.insert(nodeVerificationEventsTable).values({
      nodeId,
      actorUserId: currentUser(req).id,
      eventType: "submitted",
      status: "pending",
    });
    return [saved];
  });
  const fresh = await loadNode(updated.id);
  res.json(serializeNode(fresh!, true));
});

router.get("/me/nodes", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const user = currentUser(req);
  if (user.userType !== "participant") return sendError(res, 403, "Participant profile required.");
  const records = await db.select({
    membership: nodeMembershipsTable,
    node: nodesTable,
    organisation: organisationsTable,
  }).from(nodeMembershipsTable)
    .innerJoin(nodesTable, eq(nodesTable.id, nodeMembershipsTable.nodeId))
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(eq(nodeMembershipsTable.userId, user.id))
    .orderBy(desc(nodeMembershipsTable.isPrimary), desc(nodeMembershipsTable.joinedAt));
  res.json(records.map(({ membership, node, organisation }) => ({
    node: serializeNode({ node, organisation }),
    role: membership.participationRole,
    status: membership.status,
    isPrimary: membership.isPrimary,
    joinedAt: membership.joinedAt.toISOString(),
  })));
});

router.post("/nodes/:nodeId/connect", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Choose how you want to take part.");
  const user = currentUser(req);
  if (user.userType !== "participant") return sendError(res, 403, "Participant profile required.");
  const record = await loadNode(nodeId);
  if (
    !record ||
    record.node.verificationStatus !== "verified" ||
    record.node.visibility !== "public"
  ) {
    return sendError(res, 404, "This Node is not publicly available.");
  }
  const result = await db.transaction(async (transaction) => {
    await transaction.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, user.id)).for("update");
    const [existing] = await transaction.select({ id: nodeMembershipsTable.id })
      .from(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.nodeId, nodeId), eq(nodeMembershipsTable.userId, user.id)))
      .limit(1);
    if (existing) return "duplicate" as const;
    const status = record.node.approvalRequired ? "pending" : "active";
    const [active] = await transaction.select({ id: nodeMembershipsTable.id })
      .from(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.userId, user.id), eq(nodeMembershipsTable.status, "active")))
      .limit(1);
    const [membership] = await transaction.insert(nodeMembershipsTable).values({
      nodeId,
      userId: user.id,
      participationRole: parsed.data.role,
      status,
      isPrimary: status === "active" && !active,
    }).onConflictDoNothing().returning();
    if (!membership) return "duplicate" as const;
    return membership;
  });
  if (result === "duplicate") return sendError(res, 409, "You are already connected to this Node.");
  res.status(201).json({
    nodeId,
    role: result.participationRole,
    status: result.status,
    isPrimary: result.isPrimary,
    joinedAt: result.joinedAt.toISOString(),
    xpAwarded: 0,
  });
});

router.patch("/me/nodes/:nodeId", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Choose a valid participation role.");
  const user = currentUser(req);
  if (user.userType !== "participant") return sendError(res, 403, "Participant profile required.");
  const [membership] = await db.update(nodeMembershipsTable)
    .set({ participationRole: parsed.data.role, updatedAt: new Date() })
    .where(and(eq(nodeMembershipsTable.nodeId, nodeId), eq(nodeMembershipsTable.userId, user.id)))
    .returning();
  if (!membership) return sendError(res, 404, "Node connection not found.");
  res.json({
    nodeId,
    role: membership.participationRole,
    status: membership.status,
    isPrimary: membership.isPrimary,
    joinedAt: membership.joinedAt.toISOString(),
    xpAwarded: 0,
  });
});

router.patch("/me/nodes/:nodeId/primary", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const user = currentUser(req);
  if (user.userType !== "participant") return sendError(res, 403, "Participant profile required.");
  const outcome = await db.transaction(async (transaction) => {
    await transaction.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, user.id)).for("update");
    const [membership] = await transaction.select().from(nodeMembershipsTable)
      .where(and(
        eq(nodeMembershipsTable.nodeId, nodeId),
        eq(nodeMembershipsTable.userId, user.id),
      )).limit(1);
    if (!membership || membership.status !== "active") return false;
    await transaction.update(nodeMembershipsTable).set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(nodeMembershipsTable.userId, user.id));
    await transaction.update(nodeMembershipsTable).set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(nodeMembershipsTable.id, membership.id));
    return true;
  });
  if (!outcome) return sendError(res, 404, "An active Node connection is required.");
  res.json({ nodeId, isPrimary: true });
});

router.delete("/nodes/:nodeId/connect", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const user = currentUser(req);
  if (user.userType !== "participant") return sendError(res, 403, "Participant profile required.");
  await db.transaction(async (transaction) => {
    await transaction.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, user.id)).for("update");
    const [removed] = await transaction.delete(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.nodeId, nodeId), eq(nodeMembershipsTable.userId, user.id)))
      .returning();
    if (!removed?.isPrimary) return;
    const [next] = await transaction.select({ id: nodeMembershipsTable.id })
      .from(nodeMembershipsTable)
      .where(and(eq(nodeMembershipsTable.userId, user.id), eq(nodeMembershipsTable.status, "active")))
      .orderBy(asc(nodeMembershipsTable.joinedAt))
      .limit(1);
    if (next) await transaction.update(nodeMembershipsTable)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(nodeMembershipsTable.id, next.id));
  });
  res.status(204).end();
});

router.get("/admin/nodes/review-queue", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  if (!reviewerId) return sendError(res, 503, "Node verification review is not configured.");
  if (!isVerificationReviewer(reviewerId, currentUser(req).telegramId)) {
    return sendError(res, 403, "You cannot review Node applications.");
  }
  const records = await db.select({ node: nodesTable, organisation: organisationsTable })
    .from(nodesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
    .where(inArray(nodesTable.verificationStatus, ["pending", "under_review", "needs_information"]))
    .orderBy(asc(nodesTable.submittedAt))
    .limit(100);
  res.json(records.map((record) => serializeNode(record, true)));
});

router.post("/admin/nodes/:nodeId/review", async (req, res) => {
  if (!await ensureNodeSchema(res)) return;
  const reviewerId = process.env.VERIFICATION_REVIEWER_TELEGRAM_ID;
  if (!reviewerId) return sendError(res, 503, "Node verification review is not configured.");
  const reviewer = currentUser(req);
  if (!isVerificationReviewer(reviewerId, reviewer.telegramId)) {
    return sendError(res, 403, "You cannot review Node applications.");
  }
  const nodeId = parseId(req.params.nodeId);
  if (!nodeId) return sendError(res, 400, "Choose a valid Node.");
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Choose a valid review action.");
  const note = parsed.data.note?.trim() || null;
  const reasonError = verificationReviewReasonError(parsed.data.action, note);
  if (reasonError) return sendError(res, 400, reasonError);
  const outcome = await db.transaction(async (transaction) => {
    const [record] = await transaction.select({
      node: nodesTable,
      organisation: organisationsTable,
    }).from(nodesTable)
      .innerJoin(organisationsTable, eq(organisationsTable.id, nodesTable.organisationId))
      .where(eq(nodesTable.id, nodeId))
      .for("update");
    if (!record || !["pending", "under_review", "needs_information"].includes(record.node.verificationStatus)) {
      return "not_reviewable" as const;
    }
    const [owner] = await transaction.select({ telegramId: usersTable.telegramId })
      .from(usersTable).where(eq(usersTable.id, record.organisation.ownerUserId)).limit(1);
    if (isVerificationSelfReview({
      applicantUserId: record.organisation.ownerUserId,
      reviewerUserId: reviewer.id,
      applicantTelegramId: owner?.telegramId,
      reviewerTelegramId: reviewer.telegramId,
    })) return "self_review" as const;
    const status = parsed.data.action === "approve"
      ? "verified"
      : parsed.data.action === "reject"
        ? "rejected"
        : parsed.data.action === "suspend"
          ? "suspended"
          : "needs_information";
    const reviewedAt = new Date();
    await transaction.update(nodesTable).set({
      verificationStatus: status,
      reviewerNotes: note,
      verifiedAt: status === "verified" ? reviewedAt : null,
      updatedAt: reviewedAt,
    }).where(eq(nodesTable.id, nodeId));
    await transaction.insert(nodeVerificationEventsTable).values({
      nodeId,
      actorUserId: reviewer.id,
      eventType: parsed.data.action,
      status,
      note,
    });
    return status;
  });
  if (outcome === "not_reviewable") return sendError(res, 409, "This Node is no longer awaiting review.");
  if (outcome === "self_review") return sendError(res, 403, "You cannot review your own organisation's Node.");
  res.json({ nodeId, status: outcome });
});

export default router;
