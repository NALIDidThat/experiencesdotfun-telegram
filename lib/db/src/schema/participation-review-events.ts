import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { participationsTable, usersTable } from "./experiences";

export const participationReviewEventsTable = pgTable(
  "participation_review_events",
  {
    id: serial("id").primaryKey(),
    participationId: integer("participation_id")
      .notNull()
      .references(() => participationsTable.id, { onDelete: "cascade" }),
    reviewerUserId: integer("reviewer_user_id")
      .notNull()
      .references(() => usersTable.id),
    submissionVersion: integer("submission_version").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    participationIndex: index("participation_review_events_participation_idx").on(
      table.participationId,
      table.createdAt,
    ),
    decisionCheck: check(
      "participation_review_events_decision_check",
      sql`${table.decision} IN ('verified', 'rejected')`,
    ),
    submissionVersionCheck: check(
      "participation_review_events_submission_version_check",
      sql`${table.submissionVersion} >= 1`,
    ),
    reasonLengthCheck: check(
      "participation_review_events_reason_length_check",
      sql`${table.reason} IS NULL OR length(${table.reason}) <= 500`,
    ),
  }),
);
