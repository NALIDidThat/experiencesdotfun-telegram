import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./experiences";

export const accountabilityPartnershipsTable = pgTable(
  "accountability_partnerships",
  {
    id: serial("id").primaryKey(),
    requesterUserId: integer("requester_user_id")
      .notNull()
      .references(() => usersTable.id),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status", { enum: ["pending", "active", "declined", "ended", "expired"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => ({
    participantPairIndex: uniqueIndex("accountability_partnership_pair_idx").on(
      sql`LEAST(${table.requesterUserId}, ${table.recipientUserId})`,
      sql`GREATEST(${table.requesterUserId}, ${table.recipientUserId})`,
    ),
    requesterStatusIndex: index("accountability_partnership_requester_status_idx").on(
      table.requesterUserId,
      table.status,
    ),
    recipientStatusIndex: index("accountability_partnership_recipient_status_idx").on(
      table.recipientUserId,
      table.status,
    ),
  }),
);

export const accountabilityGoalsTable = pgTable(
  "accountability_goals",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id),
    partnershipId: integer("partnership_id").references(() => accountabilityPartnershipsTable.id),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: date("target_date", { mode: "string" }),
    visibility: text("visibility", { enum: ["private", "shared"] })
      .notNull()
      .default("private"),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    titleLengthCheck: check(
      "accountability_goal_title_length_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    descriptionLengthCheck: check(
      "accountability_goal_description_length_check",
      sql`${table.description} IS NULL OR char_length(${table.description}) <= 500`,
    ),
    visibilityCheck: check(
      "accountability_goal_visibility_check",
      sql`${table.visibility} IN ('private', 'shared')`,
    ),
    statusCheck: check(
      "accountability_goal_status_check",
      sql`${table.status} IN ('active', 'completed', 'archived')`,
    ),
    ownerStatusIndex: index("accountability_goal_owner_status_idx").on(
      table.ownerUserId,
      table.status,
      table.createdAt,
    ),
    partnershipIndex: index("accountability_goal_partnership_idx").on(
      table.partnershipId,
      table.createdAt,
    ),
    visibilityPartnershipCheck: check(
      "accountability_goal_visibility_partnership_check",
      sql`(${table.visibility} = 'private' AND ${table.partnershipId} IS NULL) OR (${table.visibility} = 'shared' AND ${table.partnershipId} IS NOT NULL)`,
    ),
  }),
);

export const accountabilityCommitmentsTable = pgTable(
  "accountability_commitments",
  {
    id: serial("id").primaryKey(),
    partnershipId: integer("partnership_id")
      .references(() => accountabilityPartnershipsTable.id),
    goalId: integer("goal_id").references(() => accountabilityGoalsTable.id),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    assignedUserId: integer("assigned_user_id")
      .notNull()
      .references(() => usersTable.id),
    title: text("title").notNull(),
    description: text("description"),
    targetValue: integer("target_value").notNull().default(1),
    currentValue: integer("current_value").notNull().default(0),
    deadline: date("deadline", { mode: "string" }),
    status: text("status", { enum: ["active", "completed", "missed", "cancelled"] })
      .notNull()
      .default("active"),
    verificationStatus: text("verification_status", {
      enum: ["self_reported", "partner_confirmed", "experience_verified"],
    })
      .notNull()
      .default("self_reported"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    partnershipCreatedIndex: index("accountability_commitment_partnership_created_idx").on(
      table.partnershipId,
      table.createdAt,
    ),
    assigneeStatusIndex: index("accountability_commitment_assignee_status_idx").on(
      table.assignedUserId,
      table.status,
    ),
    goalCreatedIndex: index("accountability_commitment_goal_created_idx").on(
      table.goalId,
      table.createdAt,
    ),
  }),
);

export const accountabilityCheckInsTable = pgTable(
  "accountability_check_ins",
  {
    id: serial("id").primaryKey(),
    partnershipId: integer("partnership_id")
      .references(() => accountabilityPartnershipsTable.id),
    commitmentId: integer("commitment_id")
      .notNull()
      .references(() => accountabilityCommitmentsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status", { enum: ["completed", "partial", "missed", "rescheduled"] }).notNull(),
    note: text("note"),
    verificationStatus: text("verification_status", {
      enum: ["self_reported", "partner_confirmed", "experience_verified"],
    })
      .notNull()
      .default("self_reported"),
    verifiedByUserId: integer("verified_by_user_id").references(() => usersTable.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnershipCreatedIndex: index("accountability_checkin_partnership_created_idx").on(
      table.partnershipId,
      table.createdAt,
    ),
    commitmentCreatedIndex: index("accountability_checkin_commitment_created_idx").on(
      table.commitmentId,
      table.createdAt,
    ),
  }),
);

export const accountabilityEventsTable = pgTable(
  "accountability_events",
  {
    id: serial("id").primaryKey(),
    partnershipId: integer("partnership_id")
      .notNull()
      .references(() => accountabilityPartnershipsTable.id),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => usersTable.id),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id),
    commitmentId: integer("commitment_id").references(() => accountabilityCommitmentsTable.id),
    checkInId: integer("check_in_id").references(() => accountabilityCheckInsTable.id),
    type: text("type", {
      enum: [
        "partner_invite",
        "partner_accepted",
        "partner_declined",
        "partnership_ended",
        "commitment_created",
        "check_in_completed",
        "check_in_partial",
        "check_in_missed",
        "check_in_rescheduled",
        "check_in_confirmed",
        "encouragement_received",
      ],
    }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnershipCreatedIndex: index("accountability_event_partnership_created_idx").on(
      table.partnershipId,
      table.createdAt,
    ),
    recipientReadIndex: index("accountability_event_recipient_read_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
  }),
);

export const insertAccountabilityPartnershipSchema = createInsertSchema(accountabilityPartnershipsTable);
export const insertAccountabilityGoalSchema = createInsertSchema(accountabilityGoalsTable);
export const insertAccountabilityCommitmentSchema = createInsertSchema(accountabilityCommitmentsTable);
export const insertAccountabilityCheckInSchema = createInsertSchema(accountabilityCheckInsTable);
export const insertAccountabilityEventSchema = createInsertSchema(accountabilityEventsTable);

export type AccountabilityPartnership = typeof accountabilityPartnershipsTable.$inferSelect;
export type AccountabilityGoal = typeof accountabilityGoalsTable.$inferSelect;
export type AccountabilityCommitment = typeof accountabilityCommitmentsTable.$inferSelect;
export type AccountabilityCheckIn = typeof accountabilityCheckInsTable.$inferSelect;
export type AccountabilityEvent = typeof accountabilityEventsTable.$inferSelect;

export const accountabilityPartnershipStatusSchema = z.enum(["pending", "active", "declined", "ended", "expired"]);
export const accountabilityCommitmentStatusSchema = z.enum(["active", "completed", "missed", "cancelled"]);
export const accountabilityCheckInStatusSchema = z.enum(["completed", "partial", "missed", "rescheduled"]);
export const accountabilityVerificationStatusSchema = z.enum([
  "self_reported",
  "partner_confirmed",
  "experience_verified",
]);