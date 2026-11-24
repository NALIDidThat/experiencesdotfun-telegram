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
import { experiencesTable, usersTable } from "./experiences";

export const sharedQuestKinds = ["social", "community"] as const;
export const sharedQuestStatuses = ["active", "completed", "cancelled"] as const;
export const sharedQuestParticipantStatuses = [
  "invited",
  "active",
  "declined",
  "completed",
] as const;
export const sharedQuestNotificationTypes = [
  "invitation",
  "participant_completed",
  "quest_completed",
  "reward_granted",
] as const;

export const sharedQuestsTable = pgTable(
  "shared_quests",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: sharedQuestKinds }).notNull(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    experienceId: integer("experience_id").references(() => experiencesTable.id, {
      onDelete: "cascade",
    }),
    chatId: text("chat_id"),
    title: text("title").notNull(),
    targetCount: integer("target_count").notNull(),
    status: text("status", { enum: sharedQuestStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    titleLengthCheck: check(
      "shared_quest_title_length_check",
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 100`,
    ),
    targetCountCheck: check(
      "shared_quest_target_count_check",
      sql`${table.targetCount} BETWEEN 1 AND 500`,
    ),
    statusCheck: check(
      "shared_quest_status_check",
      sql`${table.status} IN ('active', 'completed', 'cancelled')`,
    ),
    objectiveScopeCheck: check(
      "shared_quest_scope_check",
      sql`(${table.kind} = 'social' AND ${table.experienceId} IS NOT NULL AND ${table.chatId} IS NULL)
        OR (${table.kind} = 'community' AND ${table.experienceId} IS NULL AND ${table.chatId} IS NOT NULL)`,
    ),
    ownerActivityIndex: index("shared_quest_owner_activity_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    communityActivityIndex: index("shared_quest_community_activity_idx").on(
      table.chatId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const sharedQuestParticipantsTable = pgTable(
  "shared_quest_participants",
  {
    id: serial("id").primaryKey(),
    questId: integer("quest_id")
      .notNull()
      .references(() => sharedQuestsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: sharedQuestParticipantStatuses })
      .notNull()
      .default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rewardGrantedAt: timestamp("reward_granted_at", { withTimezone: true }),
  },
  (table) => ({
    questUserUnique: uniqueIndex("shared_quest_participant_quest_user_idx").on(
      table.questId,
      table.userId,
    ),
    userActivityIndex: index("shared_quest_participant_user_activity_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusCheck: check(
      "shared_quest_participant_status_check",
      sql`${table.status} IN ('invited', 'active', 'declined', 'completed')`,
    ),
  }),
);

export const sharedQuestNotificationsTable = pgTable(
  "shared_quest_notifications",
  {
    id: serial("id").primaryKey(),
    questId: integer("quest_id")
      .notNull()
      .references(() => sharedQuestsTable.id, { onDelete: "cascade" }),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type", { enum: sharedQuestNotificationTypes }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventUnique: uniqueIndex("shared_quest_notification_event_idx").on(
      table.questId,
      table.recipientUserId,
      table.actorUserId,
      table.type,
    ),
    recipientActivityIndex: index("shared_quest_notification_recipient_activity_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    recipientUnreadIndex: index("shared_quest_notification_recipient_unread_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
  }),
);

export type SharedQuest = typeof sharedQuestsTable.$inferSelect;
export type SharedQuestParticipant = typeof sharedQuestParticipantsTable.$inferSelect;
export type SharedQuestNotification = typeof sharedQuestNotificationsTable.$inferSelect;
