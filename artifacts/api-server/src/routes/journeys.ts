import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import {
  CreateJourneyProgrammeBody,
  CreateJourneyProgrammeResponse,
  EnrolInJourneyProgrammeParams,
  EnrolInJourneyProgrammeResponse,
  GetJourneyProgrammeParams,
  GetJourneyProgrammeResponse,
  ListJourneyProgrammeParticipantsParams,
  ListJourneyProgrammeParticipantsResponse,
  ListJourneyProgrammesResponse,
  ListManagedJourneyProgrammesResponse,
  UpdateJourneyProgrammeBody,
  UpdateJourneyProgrammeParams,
  UpdateJourneyProgrammeResponse,
  WithdrawFromJourneyProgrammeParams,
  WithdrawFromJourneyProgrammeResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  experienceMilestoneSubmissionsTable,
  experienceMilestonesTable,
  experiencesTable,
  journeyEnrolmentsTable,
  journeyEventsTable,
  journeyProgrammeStepsTable,
  journeyProgrammesTable,
  organisationsTable,
  participationsTable,
  usersTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { currentOrganisation } from "../lib/data";
import {
  canManageJourneyProgramme,
  canReadJourneyEnrolment,
  deriveJourneyProgress,
  getJourneyProgrammeMetrics,
  journeyStepCompletionDedupeKey,
  nextJourneyEnrolmentStatus,
} from "../lib/journey-progress-rules.mjs";

const router = Router();
router.use(requireTelegramUser);

type JourneyStepInput = {
  kind: "experience" | "milestone" | "resource";
  title: string;
  description?: string;
  experienceId?: number;
  milestoneId?: number;
  resourceUrl?: string;
};

let schemaAvailablePromise: Promise<boolean> | undefined;

function sendError(res: Parameters<Parameters<typeof router.get>[1]>[1], status: number, message: string) {
  res.status(status).json({ message });
}

function hasAccountType(req: Parameters<typeof currentUser>[0], res: Parameters<Parameters<typeof router.get>[1]>[1], expected: "participant" | "organisation") {
  const type = currentUser(req).userType;
  if (type === expected) return true;
  res.status(type === null ? 409 : 403).json({
    message: type === null
      ? "Choose a Participant or Organisation account before continuing."
      : expected === "participant"
        ? "Development journeys are available to Participant accounts."
        : "Programme management is available to Organisation accounts.",
  });
  return false;
}

async function ensureJourneySchema(res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  try {
    schemaAvailablePromise ??= db.execute(sql`
      SELECT
        to_regclass('public.journey_programmes') IS NOT NULL AS programmes,
        to_regclass('public.journey_programme_steps') IS NOT NULL AS steps,
        to_regclass('public.journey_enrolments') IS NOT NULL AS enrolments,
        to_regclass('public.journey_events') IS NOT NULL AS events
    `).then((result) => {
      const row = result.rows[0] as {
        programmes?: boolean;
        steps?: boolean;
        enrolments?: boolean;
        events?: boolean;
      } | undefined;
      return Boolean(row?.programmes && row.steps && row.enrolments && row.events);
    });
    if (await schemaAvailablePromise) return true;
    schemaAvailablePromise = undefined;
  } catch {
    schemaAvailablePromise = undefined;
  }
  sendError(res, 503, "Development journeys are unavailable until the database migration is applied.");
  return false;
}

function safeWebUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function validateSteps(
  organisationId: number,
  steps: JourneyStepInput[],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
) {
  for (const [index, step] of steps.entries()) {
    if (step.kind === "resource") {
      if (step.experienceId !== undefined || step.milestoneId !== undefined || !step.resourceUrl || !safeWebUrl(step.resourceUrl)) {
        sendError(res, 400, "Learning resource steps need one secure HTTPS link and no activity reference.");
        return false;
      }
      continue;
    }
    if (!step.experienceId || step.resourceUrl !== undefined) {
      sendError(res, 400, "Choose an experience owned by your organisation for each activity step.");
      return false;
    }
    const [experience] = await db.select({ id: experiencesTable.id })
      .from(experiencesTable)
      .where(and(
        eq(experiencesTable.id, step.experienceId),
        eq(experiencesTable.organisationId, organisationId),
      ))
      .limit(1);
    if (!experience) {
      sendError(res, 400, `Step ${index + 1} must link to an experience owned by your organisation.`);
      return false;
    }
    if (step.kind === "experience" && step.milestoneId !== undefined) {
      sendError(res, 400, "Experience steps cannot include a milestone reference.");
      return false;
    }
    if (step.kind === "milestone") {
      if (!step.milestoneId) {
        sendError(res, 400, "Choose a milestone from the linked experience.");
        return false;
      }
      const [milestone] = await db.select({ id: experienceMilestonesTable.id })
        .from(experienceMilestonesTable)
        .innerJoin(experiencesTable, eq(experiencesTable.id, experienceMilestonesTable.experienceId))
        .where(and(
          eq(experienceMilestonesTable.id, step.milestoneId),
          eq(experienceMilestonesTable.experienceId, step.experienceId),
          eq(experiencesTable.organisationId, organisationId),
        ))
        .limit(1);
      if (!milestone) {
        sendError(res, 400, `Step ${index + 1} must link to a milestone on that owned experience.`);
        return false;
      }
    }
  }
  return true;
}

async function loadProgrammeSteps(programmeId: number) {
  const steps = await db.select({
    id: journeyProgrammeStepsTable.id,
    position: journeyProgrammeStepsTable.position,
    kind: journeyProgrammeStepsTable.kind,
    title: journeyProgrammeStepsTable.title,
    description: journeyProgrammeStepsTable.description,
    experienceId: journeyProgrammeStepsTable.experienceId,
    experienceTitle: experiencesTable.title,
    milestoneId: journeyProgrammeStepsTable.milestoneId,
    resourceUrl: journeyProgrammeStepsTable.resourceUrl,
  })
    .from(journeyProgrammeStepsTable)
    .leftJoin(experiencesTable, eq(experiencesTable.id, journeyProgrammeStepsTable.experienceId))
    .where(eq(journeyProgrammeStepsTable.programmeId, programmeId))
    .orderBy(asc(journeyProgrammeStepsTable.position));
  return steps.map((step) => ({
    ...step,
    description: step.description ?? null,
    experienceId: step.experienceId ?? null,
    experienceTitle: step.experienceTitle ?? null,
    milestoneId: step.milestoneId ?? null,
    resourceUrl: step.resourceUrl ?? null,
  }));
}

async function loadProgramme(programmeId: number) {
  const [programme] = await db.select({
    id: journeyProgrammesTable.id,
    organisationId: journeyProgrammesTable.organisationId,
    organisationName: organisationsTable.name,
    title: journeyProgrammesTable.title,
    description: journeyProgrammesTable.description,
    status: journeyProgrammesTable.status,
    createdAt: journeyProgrammesTable.createdAt,
    updatedAt: journeyProgrammesTable.updatedAt,
  })
    .from(journeyProgrammesTable)
    .innerJoin(organisationsTable, eq(organisationsTable.id, journeyProgrammesTable.organisationId))
    .where(eq(journeyProgrammesTable.id, programmeId))
    .limit(1);
  if (!programme) return null;
  return { ...programme, steps: await loadProgrammeSteps(programmeId) };
}

async function loadProgress(
  enrolment: typeof journeyEnrolmentsTable.$inferSelect,
  steps: Awaited<ReturnType<typeof loadProgrammeSteps>>,
  userId: number,
) {
  const evidence = new Map<number, { id: number; verifiedAt: Date }>();
  for (const step of steps) {
    if (step.kind === "experience" && step.experienceId !== null) {
      const [participation] = await db.select({
        id: participationsTable.id,
        verifiedAt: participationsTable.verifiedAt,
      })
        .from(participationsTable)
        .where(and(
          eq(participationsTable.userId, userId),
          eq(participationsTable.experienceId, step.experienceId),
          eq(participationsTable.status, "verified"),
          isNotNull(participationsTable.verifiedAt),
        ))
        .limit(1);
      if (participation?.verifiedAt) evidence.set(step.id, participation as { id: number; verifiedAt: Date });
    }
    if (step.kind === "milestone" && step.milestoneId !== null) {
      const [submission] = await db.select({
        id: experienceMilestoneSubmissionsTable.id,
        verifiedAt: experienceMilestoneSubmissionsTable.verifiedAt,
      })
        .from(experienceMilestoneSubmissionsTable)
        .innerJoin(
          participationsTable,
          eq(participationsTable.id, experienceMilestoneSubmissionsTable.participationId),
        )
        .where(and(
          eq(experienceMilestoneSubmissionsTable.milestoneId, step.milestoneId),
          eq(experienceMilestoneSubmissionsTable.status, "verified"),
          isNotNull(experienceMilestoneSubmissionsTable.verifiedAt),
          eq(participationsTable.userId, userId),
        ))
        .limit(1);
      if (submission?.verifiedAt) evidence.set(step.id, submission as { id: number; verifiedAt: Date });
    }
  }

  const progress = deriveJourneyProgress(steps, evidence);
  for (const step of progress.steps) {
    if (step.status !== "complete" || step.sourceRecordId === null) continue;
    await db.insert(journeyEventsTable).values({
      enrolmentId: enrolment.id,
      actorUserId: null,
      stepId: step.stepId,
      eventType: "step_completed",
      sourceRecordId: step.sourceRecordId,
      dedupeKey: journeyStepCompletionDedupeKey(enrolment.id, step.stepId),
    }).onConflictDoNothing({ target: journeyEventsTable.dedupeKey });
  }

  let currentEnrolment = enrolment;
  if (nextJourneyEnrolmentStatus(enrolment.status, progress) === "completed") {
    const completedAt = new Date();
    const [updated] = await db.update(journeyEnrolmentsTable)
      .set({ status: "completed", completedAt, updatedAt: completedAt })
      .where(and(
        eq(journeyEnrolmentsTable.id, enrolment.id),
        eq(journeyEnrolmentsTable.status, "active"),
      ))
      .returning();
    if (updated) {
      currentEnrolment = updated;
      await db.insert(journeyEventsTable).values({
        enrolmentId: enrolment.id,
        actorUserId: null,
        eventType: "completed",
        dedupeKey: `completed:${enrolment.id}`,
      }).onConflictDoNothing({ target: journeyEventsTable.dedupeKey });
    }
  }
  const auditEvents = await db.select({
    id: journeyEventsTable.id,
    eventType: journeyEventsTable.eventType,
    stepId: journeyEventsTable.stepId,
    sourceRecordId: journeyEventsTable.sourceRecordId,
    createdAt: journeyEventsTable.createdAt,
  })
    .from(journeyEventsTable)
    .where(eq(journeyEventsTable.enrolmentId, enrolment.id))
    .orderBy(asc(journeyEventsTable.createdAt), asc(journeyEventsTable.id));
  return {
    enrolmentId: currentEnrolment.id,
    status: currentEnrolment.status,
    enrolledAt: currentEnrolment.enrolledAt,
    completedAt: currentEnrolment.completedAt,
    withdrawnAt: currentEnrolment.withdrawnAt,
    progress,
    auditEvents: auditEvents.map((event) => ({
      ...event,
      stepId: event.stepId ?? null,
      sourceRecordId: event.sourceRecordId ?? null,
    })),
  };
}

async function loadParticipantProgramme(programmeId: number, userId: number) {
  const programme = await loadProgramme(programmeId);
  if (!programme) return null;
  const [enrolment] = await db.select()
    .from(journeyEnrolmentsTable)
    .where(and(
      eq(journeyEnrolmentsTable.programmeId, programmeId),
      eq(journeyEnrolmentsTable.userId, userId),
    ))
    .limit(1);
  const progress = enrolment && canReadJourneyEnrolment(
    "participant",
    userId,
    enrolment.userId,
  )
    ? await loadProgress(enrolment, programme.steps, userId)
    : null;
  return { ...programme, enrolment: progress };
}

type JourneyTransaction = Pick<typeof db, "insert" | "delete">;

async function saveStepRows(
  transaction: JourneyTransaction,
  programmeId: number,
  steps: JourneyStepInput[],
) {
  await transaction.insert(journeyProgrammeStepsTable).values(steps.map((step, index) => ({
    programmeId,
    position: index + 1,
    kind: step.kind,
    title: step.title.trim(),
    description: step.description?.trim() || null,
    experienceId: step.experienceId ?? null,
    milestoneId: step.milestoneId ?? null,
    resourceUrl: step.resourceUrl ?? null,
  })));
}

function validPathId(raw: string | string[] | undefined) {
  const number = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

router.get("/", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "participant") || !await ensureJourneySchema(res)) return;
  const user = currentUser(req);
  const programmeIds = await db.select({ id: journeyProgrammesTable.id })
    .from(journeyProgrammesTable)
    .leftJoin(journeyEnrolmentsTable, and(
      eq(journeyEnrolmentsTable.programmeId, journeyProgrammesTable.id),
      eq(journeyEnrolmentsTable.userId, user.id),
    ))
    .where(or(
      eq(journeyProgrammesTable.status, "published"),
      isNotNull(journeyEnrolmentsTable.id),
    ))
    .orderBy(asc(journeyProgrammesTable.createdAt));
  const programmes = await Promise.all(programmeIds.map(({ id }) => loadParticipantProgramme(id, user.id)));
  res.json(ListJourneyProgrammesResponse.parse(programmes.filter(Boolean)));
});

router.post("/", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "organisation") || !await ensureJourneySchema(res)) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    sendError(res, 404, "Organisation profile not found.");
    return;
  }
  const parsed = CreateJourneyProgrammeBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Add a programme title, description, and at least one valid step.");
    return;
  }
  if (!await validateSteps(organisation.id, parsed.data.steps as JourneyStepInput[], res)) return;

  const saved = await db.transaction(async (transaction) => {
    const [programme] = await transaction.insert(journeyProgrammesTable).values({
      organisationId: organisation.id,
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      status: parsed.data.status ?? "draft",
    }).returning();
    if (!programme) throw new Error("Programme could not be created.");
    await saveStepRows(transaction, programme.id, parsed.data.steps as JourneyStepInput[]);
    return programme;
  });
  const response = await loadProgramme(saved.id);
  if (!response) {
    sendError(res, 503, "The programme was saved but could not be loaded. Please refresh.");
    return;
  }
  res.status(201).json(CreateJourneyProgrammeResponse.parse(response));
});

router.get("/manage", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "organisation") || !await ensureJourneySchema(res)) return;
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    sendError(res, 404, "Organisation profile not found.");
    return;
  }
  const owned = await db.select({ id: journeyProgrammesTable.id })
    .from(journeyProgrammesTable)
    .where(eq(journeyProgrammesTable.organisationId, organisation.id))
    .orderBy(asc(journeyProgrammesTable.createdAt));
  const managed = await Promise.all(owned.map(async ({ id }) => {
    const programme = await loadProgramme(id);
    if (!programme) return null;
    const enrolments = await db.select()
      .from(journeyEnrolmentsTable)
      .where(eq(journeyEnrolmentsTable.programmeId, id));
    for (const enrolment of enrolments) {
      if (enrolment.status === "active") {
        await loadProgress(enrolment, programme.steps, enrolment.userId);
      }
    }
    const freshEnrolments = await db.select({ status: journeyEnrolmentsTable.status })
      .from(journeyEnrolmentsTable)
      .where(eq(journeyEnrolmentsTable.programmeId, id));
    return { ...programme, metrics: getJourneyProgrammeMetrics(freshEnrolments) };
  }));
  res.json(ListManagedJourneyProgrammesResponse.parse(managed.filter(Boolean)));
});

router.get("/:journeyId", async (req, res): Promise<void> => {
  if (!await ensureJourneySchema(res)) return;
  const params = GetJourneyProgrammeParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Choose a valid programme.");
    return;
  }
  const user = currentUser(req);
  if (user.userType === "participant") {
    const [published] = await db.select({ id: journeyProgrammesTable.id })
      .from(journeyProgrammesTable)
      .leftJoin(journeyEnrolmentsTable, and(
        eq(journeyEnrolmentsTable.programmeId, journeyProgrammesTable.id),
        eq(journeyEnrolmentsTable.userId, user.id),
      ))
      .where(and(
        eq(journeyProgrammesTable.id, params.data.journeyId),
        or(
          eq(journeyProgrammesTable.status, "published"),
          isNotNull(journeyEnrolmentsTable.id),
        ),
      ))
      .limit(1);
    if (!published) {
      sendError(res, 404, "Published programme not found.");
      return;
    }
    const response = await loadParticipantProgramme(published.id, user.id);
    if (!response) {
      sendError(res, 404, "Published programme not found.");
      return;
    }
    res.json(GetJourneyProgrammeResponse.parse(response));
    return;
  }
  if (!hasAccountType(req, res, "organisation")) return;
  const organisation = await currentOrganisation(user.id);
  const [owned] = await db.select({
    id: journeyProgrammesTable.id,
    organisationId: journeyProgrammesTable.organisationId,
  })
    .from(journeyProgrammesTable)
    .where(eq(journeyProgrammesTable.id, params.data.journeyId))
    .limit(1);
  if (!owned || !canManageJourneyProgramme(
    user.userType,
    organisation?.id ?? null,
    owned.organisationId,
  )) {
    sendError(res, 404, "Organisation programme not found.");
    return;
  }
  const programme = await loadProgramme(owned.id);
  if (!programme) {
    sendError(res, 404, "Organisation programme not found.");
    return;
  }
  res.json(GetJourneyProgrammeResponse.parse({ ...programme, enrolment: null }));
});

router.patch("/:journeyId", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "organisation") || !await ensureJourneySchema(res)) return;
  const params = UpdateJourneyProgrammeParams.safeParse(req.params);
  const parsed = UpdateJourneyProgrammeBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(req.body ?? {}).length === 0) {
    sendError(res, 400, "Choose a valid programme and provide at least one valid change.");
    return;
  }
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    sendError(res, 404, "Organisation profile not found.");
    return;
  }
  const [programme] = await db.select()
    .from(journeyProgrammesTable)
    .where(and(
      eq(journeyProgrammesTable.id, params.data.journeyId),
      eq(journeyProgrammesTable.organisationId, organisation.id),
    ))
    .limit(1);
  if (!programme || !canManageJourneyProgramme(
    currentUser(req).userType,
    organisation.id,
    programme.organisationId,
  )) {
    sendError(res, 404, "Organisation programme not found.");
    return;
  }
  if (parsed.data.steps) {
    const [enrolment] = await db.select({ id: journeyEnrolmentsTable.id })
      .from(journeyEnrolmentsTable)
      .where(eq(journeyEnrolmentsTable.programmeId, programme.id))
      .limit(1);
    if (enrolment) {
      sendError(res, 409, "Programme steps cannot change after a participant enrols; create a new programme instead.");
      return;
    }
    if (!await validateSteps(organisation.id, parsed.data.steps as JourneyStepInput[], res)) return;
  }
  await db.transaction(async (transaction) => {
    await transaction.update(journeyProgrammesTable)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(journeyProgrammesTable.id, programme.id));
    if (parsed.data.steps) {
      await transaction.delete(journeyProgrammeStepsTable)
        .where(eq(journeyProgrammeStepsTable.programmeId, programme.id));
      await saveStepRows(transaction, programme.id, parsed.data.steps as JourneyStepInput[]);
    }
  });
  const response = await loadProgramme(programme.id);
  if (!response) {
    sendError(res, 404, "Organisation programme not found.");
    return;
  }
  res.json(UpdateJourneyProgrammeResponse.parse(response));
});

router.post("/:journeyId/enrol", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "participant") || !await ensureJourneySchema(res)) return;
  const params = EnrolInJourneyProgrammeParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Choose a valid programme.");
    return;
  }
  const user = currentUser(req);
  const [programme] = await db.select({ id: journeyProgrammesTable.id })
    .from(journeyProgrammesTable)
    .where(and(
      eq(journeyProgrammesTable.id, params.data.journeyId),
      eq(journeyProgrammesTable.status, "published"),
    ))
    .limit(1);
  if (!programme) {
    sendError(res, 404, "Published programme not found.");
    return;
  }

  let created = false;
  const enrolment = await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${programme.id}, ${user.id})`);
    let [current] = await transaction.select()
      .from(journeyEnrolmentsTable)
      .where(and(
        eq(journeyEnrolmentsTable.programmeId, programme.id),
        eq(journeyEnrolmentsTable.userId, user.id),
      ))
      .limit(1);
    if (current?.status === "completed") return current;
    if (current?.status === "active") return current;
    if (current) {
      [current] = await transaction.update(journeyEnrolmentsTable)
        .set({
          status: "active",
          enrolledAt: new Date(),
          withdrawnAt: null,
          updatedAt: new Date(),
        })
        .where(eq(journeyEnrolmentsTable.id, current.id))
        .returning();
    } else {
      [current] = await transaction.insert(journeyEnrolmentsTable)
        .values({ programmeId: programme.id, userId: user.id })
        .returning();
      created = true;
    }
    if (!current) throw new Error("Enrolment could not be saved.");
    await transaction.insert(journeyEventsTable).values({
      enrolmentId: current.id,
      actorUserId: user.id,
      eventType: "enrolled",
      dedupeKey: `enrolled:${current.id}:${crypto.randomUUID()}`,
    });
    return current;
  });
  const responseProgramme = await loadProgramme(programme.id);
  if (!responseProgramme) {
    sendError(res, 404, "Published programme not found.");
    return;
  }
  const response = await loadProgress(enrolment, responseProgramme.steps, user.id);
  res.status(created ? 201 : 200).json(EnrolInJourneyProgrammeResponse.parse(response));
});

router.post("/:journeyId/withdraw", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "participant") || !await ensureJourneySchema(res)) return;
  const params = WithdrawFromJourneyProgrammeParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Choose a valid programme.");
    return;
  }
  const user = currentUser(req);
  const [enrolment] = await db.select()
    .from(journeyEnrolmentsTable)
    .innerJoin(
      journeyProgrammesTable,
      eq(journeyProgrammesTable.id, journeyEnrolmentsTable.programmeId),
    )
    .where(and(
      eq(journeyEnrolmentsTable.programmeId, params.data.journeyId),
      eq(journeyEnrolmentsTable.userId, user.id),
    ))
    .limit(1)
    .then((rows) => rows.map((row) => row.journey_enrolments));
  if (!enrolment) {
    sendError(res, 404, "Your programme enrolment was not found.");
    return;
  }
  if (enrolment.status === "completed") {
    sendError(res, 409, "A completed programme cannot be withdrawn.");
    return;
  }
  let current = enrolment;
  if (enrolment.status === "active") {
    const withdrawnAt = new Date();
    const [updated] = await db.update(journeyEnrolmentsTable)
      .set({ status: "withdrawn", withdrawnAt, updatedAt: withdrawnAt })
      .where(and(
        eq(journeyEnrolmentsTable.id, enrolment.id),
        eq(journeyEnrolmentsTable.status, "active"),
      ))
      .returning();
    if (updated) {
      current = updated;
      await db.insert(journeyEventsTable).values({
        enrolmentId: enrolment.id,
        actorUserId: user.id,
        eventType: "withdrawn",
        dedupeKey: `withdrawn:${enrolment.id}:${crypto.randomUUID()}`,
      });
    } else {
      const [latest] = await db.select().from(journeyEnrolmentsTable)
        .where(eq(journeyEnrolmentsTable.id, enrolment.id))
        .limit(1);
      if (!latest) {
        sendError(res, 404, "Your programme enrolment was not found.");
        return;
      }
      if (latest.status === "completed") {
        sendError(res, 409, "A completed programme cannot be withdrawn.");
        return;
      }
      current = latest;
    }
  }
  const programme = await loadProgramme(params.data.journeyId);
  if (!programme) {
    sendError(res, 404, "Published programme not found.");
    return;
  }
  const response = await loadProgress(current, programme.steps, user.id);
  res.json(WithdrawFromJourneyProgrammeResponse.parse(response));
});

router.get("/manage/:journeyId/participants", async (req, res): Promise<void> => {
  if (!hasAccountType(req, res, "organisation") || !await ensureJourneySchema(res)) return;
  const params = ListJourneyProgrammeParticipantsParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Choose a valid programme.");
    return;
  }
  const organisation = await currentOrganisation(currentUser(req).id);
  if (!organisation) {
    sendError(res, 404, "Organisation profile not found.");
    return;
  }
  const [programme] = await db.select({
    id: journeyProgrammesTable.id,
    organisationId: journeyProgrammesTable.organisationId,
  })
    .from(journeyProgrammesTable)
    .where(eq(journeyProgrammesTable.id, params.data.journeyId))
    .limit(1);
  if (!programme || !canManageJourneyProgramme(
    currentUser(req).userType,
    organisation.id,
    programme.organisationId,
  )) {
    sendError(res, 404, "Organisation programme not found.");
    return;
  }
  const steps = await loadProgrammeSteps(programme.id);
  const enrolments = await db.select({
    enrolment: journeyEnrolmentsTable,
    participantId: usersTable.id,
    participantName: usersTable.name,
  })
    .from(journeyEnrolmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, journeyEnrolmentsTable.userId))
    .where(eq(journeyEnrolmentsTable.programmeId, programme.id));
  const participants = await Promise.all(enrolments.map(async ({ enrolment, participantId, participantName }) => ({
    participantId,
    participantName,
    enrolment: await loadProgress(enrolment, steps, participantId),
  })));
  res.json(ListJourneyProgrammeParticipantsResponse.parse(participants));
});

export default router;
