import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { experienceMilestonesTable } from "./experience-milestones";
import {
  experiencesTable,
  organisationsTable,
  usersTable,
} from "./experiences";

export const journeyProgrammeStatuses = ["draft", "published", "archived"] as const;
export const journeyStepKinds = ["experience", "milestone", "resource"] as const;
export const journeyEnrolmentStatuses = ["active", "completed", "withdrawn"] as const;
export const journeyEventTypes = ["enrolled", "withdrawn", "step_completed", "completed"] as const;

export const journeyProgrammesTable = pgTable(
  "journey_programmes",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: journeyProgrammeStatuses }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organisationStatusIndex: index("journey_programmes_org_status_idx").on(
      table.organisationId,
      table.status,
      table.createdAt,
    ),
    titleLengthCheck: check(
      "journey_programmes_title_length_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    descriptionLengthCheck: check(
      "journey_programmes_description_length_check",
      sql`char_length(btrim(${table.description})) BETWEEN 1 AND 1000`,
    ),
    statusCheck: check(
      "journey_programmes_status_check",
      sql`${table.status} IN ('draft', 'published', 'archived')`,
    ),
  }),
);

export const journeyProgrammeStepsTable = pgTable(
  "journey_programme_steps",
  {
    id: serial("id").primaryKey(),
    programmeId: integer("programme_id")
      .notNull()
      .references(() => journeyProgrammesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind", { enum: journeyStepKinds }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    experienceId: integer("experience_id").references(() => experiencesTable.id, {
      onDelete: "restrict",
    }),
    milestoneId: integer("milestone_id").references(() => experienceMilestonesTable.id, {
      onDelete: "restrict",
    }),
    resourceUrl: text("resource_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programmePositionIndex: uniqueIndex("journey_programme_step_position_idx").on(
      table.programmeId,
      table.position,
    ),
    programmeIndex: index("journey_programme_step_programme_idx").on(table.programmeId),
    positionCheck: check(
      "journey_programme_step_position_check",
      sql`${table.position} BETWEEN 1 AND 20`,
    ),
    titleLengthCheck: check(
      "journey_programme_step_title_length_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    descriptionLengthCheck: check(
      "journey_programme_step_description_length_check",
      sql`${table.description} IS NULL OR char_length(${table.description}) <= 500`,
    ),
    kindReferenceCheck: check(
      "journey_programme_step_kind_reference_check",
      sql`(
        (${table.kind} = 'experience' AND ${table.experienceId} IS NOT NULL AND ${table.milestoneId} IS NULL AND ${table.resourceUrl} IS NULL)
        OR (${table.kind} = 'milestone' AND ${table.experienceId} IS NOT NULL AND ${table.milestoneId} IS NOT NULL AND ${table.resourceUrl} IS NULL)
        OR (${table.kind} = 'resource' AND ${table.experienceId} IS NULL AND ${table.milestoneId} IS NULL AND ${table.resourceUrl} IS NOT NULL)
      )`,
    ),
  }),
);

export const journeyEnrolmentsTable = pgTable(
  "journey_enrolments",
  {
    id: serial("id").primaryKey(),
    programmeId: integer("programme_id")
      .notNull()
      .references(() => journeyProgrammesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: journeyEnrolmentStatuses }).notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programmeUserIndex: uniqueIndex("journey_enrolment_programme_user_idx").on(
      table.programmeId,
      table.userId,
    ),
    userStatusIndex: index("journey_enrolment_user_status_idx").on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
    programmeStatusIndex: index("journey_enrolment_programme_status_idx").on(
      table.programmeId,
      table.status,
      table.updatedAt,
    ),
    statusCheck: check(
      "journey_enrolment_status_check",
      sql`${table.status} IN ('active', 'completed', 'withdrawn')`,
    ),
    completionStateCheck: check(
      "journey_enrolment_completion_state_check",
      sql`(${table.status} = 'completed' AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.completedAt} IS NULL)`,
    ),
  }),
);

export const journeyEventsTable = pgTable(
  "journey_events",
  {
    id: serial("id").primaryKey(),
    enrolmentId: integer("enrolment_id")
      .notNull()
      .references(() => journeyEnrolmentsTable.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    stepId: integer("step_id").references(() => journeyProgrammeStepsTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type", { enum: journeyEventTypes }).notNull(),
    sourceRecordId: integer("source_record_id"),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupeIndex: uniqueIndex("journey_events_dedupe_idx").on(table.dedupeKey),
    enrolmentCreatedIndex: index("journey_events_enrolment_created_idx").on(
      table.enrolmentId,
      table.createdAt,
    ),
    eventTypeCheck: check(
      "journey_events_type_check",
      sql`${table.eventType} IN ('enrolled', 'withdrawn', 'step_completed', 'completed')`,
    ),
  }),
);

export type JourneyProgramme = typeof journeyProgrammesTable.$inferSelect;
export type JourneyProgrammeStep = typeof journeyProgrammeStepsTable.$inferSelect;
export type JourneyEnrolment = typeof journeyEnrolmentsTable.$inferSelect;
export type JourneyEvent = typeof journeyEventsTable.$inferSelect;
