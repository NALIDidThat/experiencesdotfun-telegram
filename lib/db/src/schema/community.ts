import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./experiences";

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

export type CommunityContribution = typeof communityContributionsTable.$inferSelect;
export type CommunityMember = typeof communityMembersTable.$inferSelect;