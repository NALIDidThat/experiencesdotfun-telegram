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
import { createInsertSchema } from "drizzle-zod";
import { experiencesTable, usersTable } from "./experiences";

export const experienceChallengeStatuses = [
  "pending",
  "accepted",
  "declined",
  "completed",
] as const;

export const experienceChallengesTable = pgTable(
  "experience_challenges",
  {
    id: serial("id").primaryKey(),
    experienceId: integer("experience_id")
      .notNull()
      .references(() => experiencesTable.id, { onDelete: "cascade" }),
    challengerUserId: integer("challenger_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    challengedUserId: integer("challenged_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: experienceChallengeStatuses })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    challengerActivityIndex: index("experience_challenges_challenger_activity_idx").on(
      table.challengerUserId,
      table.createdAt,
    ),
    challengedActivityIndex: index("experience_challenges_challenged_activity_idx").on(
      table.challengedUserId,
      table.createdAt,
    ),
    activePairIndex: uniqueIndex("experience_challenges_active_pair_idx")
      .on(
        table.experienceId,
        sql`LEAST(${table.challengerUserId}, ${table.challengedUserId})`,
        sql`GREATEST(${table.challengerUserId}, ${table.challengedUserId})`,
      )
      .where(sql`${table.status} IN ('pending', 'accepted')`),
    differentParticipantsCheck: check(
      "experience_challenges_different_participants_check",
      sql`${table.challengerUserId} <> ${table.challengedUserId}`,
    ),
    statusCheck: check(
      "experience_challenges_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'declined', 'completed')`,
    ),
  }),
);

export const insertExperienceChallengeSchema = createInsertSchema(
  experienceChallengesTable,
).omit({ id: true, createdAt: true });

export type ExperienceChallenge = typeof experienceChallengesTable.$inferSelect;