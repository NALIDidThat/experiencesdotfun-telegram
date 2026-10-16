import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { experiencesTable, participationsTable, usersTable } from "./experiences";

export const experienceMilestonesTable = pgTable(
  "experience_milestones",
  {
    id: serial("id").primaryKey(),
    experienceId: integer("experience_id")
      .notNull()
      .references(() => experiencesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    xpReward: integer("xp_reward").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    experiencePositionUnique: uniqueIndex(
      "experience_milestones_experience_position_idx",
    ).on(table.experienceId, table.position),
    experienceIndex: index("experience_milestones_experience_idx").on(
      table.experienceId,
    ),
  }),
);

export const experienceMilestoneSubmissionsTable = pgTable(
  "experience_milestone_submissions",
  {
    id: serial("id").primaryKey(),
    milestoneId: integer("milestone_id")
      .notNull()
      .references(() => experienceMilestonesTable.id, { onDelete: "cascade" }),
    participationId: integer("participation_id")
      .notNull()
      .references(() => participationsTable.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["submitted", "verified", "rejected"],
    })
      .notNull()
      .default("submitted"),
    evidenceObjectKeys: jsonb("evidence_object_keys").$type<string[]>().notNull().default([]),
    reviewReason: text("review_reason"),
    submissionVersion: integer("submission_version").notNull().default(1),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => ({
    milestoneParticipationUnique: uniqueIndex(
      "experience_milestone_submissions_milestone_participation_idx",
    ).on(table.milestoneId, table.participationId),
    milestoneStatusIndex: index(
      "experience_milestone_submissions_milestone_status_idx",
    ).on(table.milestoneId, table.status),
    participationIndex: index(
      "experience_milestone_submissions_participation_idx",
    ).on(table.participationId),
  }),
);

export type ExperienceMilestone = typeof experienceMilestonesTable.$inferSelect;
export type ExperienceMilestoneSubmission =
  typeof experienceMilestoneSubmissionsTable.$inferSelect;

export const experienceMilestoneReviewEventsTable = pgTable(
  "experience_milestone_review_events",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(
      () => experienceMilestoneSubmissionsTable.id,
      { onDelete: "cascade" },
    ),
    reviewerUserId: integer("reviewer_user_id")
      .notNull()
      .references(() => usersTable.id),
    submissionVersion: integer("submission_version").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    submissionIndex: index("experience_milestone_review_events_submission_idx").on(
      table.submissionId,
      table.createdAt,
    ),
  }),
);