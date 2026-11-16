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
import { sql } from "drizzle-orm";
import { usersTable } from "./experiences";
import { telegramCommunitiesTable } from "./community-moderation";

export const communityContributionsTable = pgTable(
  "community_contributions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    adminUserId: integer("admin_user_id").references(() => usersTable.id),
    chatId: text("chat_id").notNull(),
    telegramMessageId: text("telegram_message_id").notNull(),
    targetMessageId: text("target_message_id"),
    contributionType: text("contribution_type").notNull(),
    qualificationReason: text("qualification_reason").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    messageHash: text("message_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatMessageUnique: uniqueIndex("community_contributions_chat_message_idx").on(
      table.chatId,
      table.telegramMessageId,
    ),
    communityHistoryIndex: index("community_contributions_chat_user_created_idx").on(
      table.chatId,
      table.userId,
      table.createdAt,
    ),
    userHistoryIndex: index("community_contributions_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    adminRewardLimitIndex: index("community_contributions_admin_limit_idx").on(
      table.chatId,
      table.adminUserId,
      table.userId,
      table.createdAt,
    ),
    duplicateCheckIndex: index("community_contributions_duplicate_idx").on(
      table.chatId,
      table.userId,
      table.messageHash,
      table.createdAt,
    ),
  }),
);

export const communityMembersTable = pgTable(
  "community_members",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    chatTitle: text("chat_title").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    communityXp: integer("community_xp").notNull().default(0),
    contributionCount: integer("contribution_count").notNull().default(0),
    qualifyingMessages: integer("qualifying_messages").notNull().default(0),
    communityXpUpdatedAt: timestamp("community_xp_updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
    firstContributionAt: timestamp("first_contribution_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
    lastContributionAt: timestamp("last_contribution_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    communityUserUnique: uniqueIndex("community_members_chat_user_idx").on(
      table.chatId,
      table.userId,
    ),
    leaderboardIndex: index("community_members_leaderboard_idx").on(
      table.chatId,
      table.communityXp,
      table.contributionCount,
      table.communityXpUpdatedAt,
      table.userId,
    ),
    userCommunitiesIndex: index("community_members_user_xp_idx").on(
      table.userId,
      table.communityXp,
    ),
  }),
);

export const telegramCommunityMemberStatsTable = pgTable(
  "telegram_community_member_stats",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramCommunitiesTable.chatId, { onDelete: "cascade" }),
    telegramUserId: text("telegram_user_id").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    messageCount: integer("message_count").notNull().default(0),
    qualifyingMessageCount: integer("qualifying_message_count").notNull().default(0),
    telegramJoinedAt: timestamp("telegram_joined_at", { withTimezone: true }),
    telegramLeftAt: timestamp("telegram_left_at", { withTimezone: true }),
    lastMessageId: integer("last_message_id"),
    lastQualifyingMessageAt: timestamp("last_qualifying_message_at", { withTimezone: true }),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    communityUserUnique: uniqueIndex("telegram_community_member_stats_chat_user_idx").on(
      table.chatId,
      table.telegramUserId,
    ),
    messageCountCheck: check(
      "telegram_community_member_stats_message_count_check",
      sql`${table.messageCount} >= 0`,
    ),
    qualifyingMessageCountCheck: check(
      "telegram_community_member_stats_qualifying_message_count_check",
      sql`${table.qualifyingMessageCount} >= 0`,
    ),
    leaderboardIndex: index("telegram_community_member_stats_leaderboard_idx").on(
      table.chatId,
      table.qualifyingMessageCount,
      table.id,
    ),
  }),
);

export const telegramCommunityMemberDailyActivityTable = pgTable(
  "telegram_community_member_daily_activity",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramCommunitiesTable.chatId, { onDelete: "cascade" }),
    telegramUserId: text("telegram_user_id").notNull(),
    activityDate: date("activity_date", { mode: "string" }).notNull(),
    qualifyingMessageCount: integer("qualifying_message_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    communityMemberDayUnique: uniqueIndex("telegram_community_member_daily_activity_unique_idx").on(
      table.chatId,
      table.telegramUserId,
      table.activityDate,
    ),
    communityDayIndex: index("telegram_community_member_daily_activity_day_idx").on(
      table.chatId,
      table.activityDate,
    ),
    qualifyingMessageCountCheck: check(
      "telegram_community_member_daily_activity_count_check",
      sql`${table.qualifyingMessageCount} >= 0`,
    ),
  }),
);

export type CommunityContribution = typeof communityContributionsTable.$inferSelect;
export type CommunityMember = typeof communityMembersTable.$inferSelect;
export type TelegramCommunityMemberStats = typeof telegramCommunityMemberStatsTable.$inferSelect;