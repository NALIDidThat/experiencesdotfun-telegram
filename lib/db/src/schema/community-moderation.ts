import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organisationsTable, usersTable } from "./experiences";

export const telegramCommunitiesTable = pgTable(
  "telegram_communities",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    chatTitle: text("chat_title").notNull(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    connectedByUserId: integer("connected_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    spamProtectionEnabled: boolean("spam_protection_enabled").notNull().default(false),
    riddlesEnabled: boolean("riddles_enabled").notNull().default(false),
    riddleIntervalMinutes: integer("riddle_interval_minutes").notNull().default(60),
    nextRiddleAt: timestamp("next_riddle_at", { withTimezone: true }),
    activeRiddleMessageId: integer("active_riddle_message_id"),
    activeRiddleId: text("active_riddle_id"),
    activeRiddleExpiresAt: timestamp("active_riddle_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatUnique: uniqueIndex("telegram_communities_chat_id_idx").on(table.chatId),
    organisationIndex: index("telegram_communities_organisation_idx").on(table.organisationId),
    riddlesDueIndex: index("telegram_communities_riddles_due_idx").on(
      table.riddlesEnabled,
      table.nextRiddleAt,
    ),
    riddleIntervalCheck: check(
      "telegram_communities_riddle_interval_check",
      sql`${table.riddleIntervalMinutes} IN (30, 60, 180, 360, 720, 1440)`,
    ),
    activeRiddleCheck: check(
      "telegram_communities_active_riddle_check",
      sql`(
        (${table.activeRiddleMessageId} IS NULL AND ${table.activeRiddleId} IS NULL AND ${table.activeRiddleExpiresAt} IS NULL)
        OR
        (${table.activeRiddleMessageId} IS NOT NULL AND ${table.activeRiddleId} IS NOT NULL AND ${table.activeRiddleExpiresAt} IS NOT NULL)
      )`,
    ),
  }),
);

export const telegramCommunityKeywordRulesTable = pgTable(
  "telegram_community_keyword_rules",
  {
    id: serial("id").primaryKey(),
    communityId: integer("community_id")
      .notNull()
      .references(() => telegramCommunitiesTable.id, { onDelete: "cascade" }),
    phrase: text("phrase").notNull(),
    normalizedPhrase: text("normalized_phrase").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phraseUnique: uniqueIndex("telegram_community_keyword_rules_phrase_idx").on(
      table.communityId,
      table.normalizedPhrase,
    ),
    communityEnabledIndex: index("telegram_community_keyword_rules_enabled_idx").on(
      table.communityId,
      table.enabled,
    ),
  }),
);

export const telegramCommunityLinkRulesTable = pgTable(
  "telegram_community_link_rules",
  {
    id: serial("id").primaryKey(),
    communityId: integer("community_id")
      .notNull()
      .references(() => telegramCommunitiesTable.id, { onDelete: "cascade" }),
    link: text("link").notNull(),
    normalizedHost: text("normalized_host").notNull(),
    normalizedPath: text("normalized_path").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    linkUnique: uniqueIndex("telegram_community_link_rules_unique_idx").on(
      table.communityId,
      table.normalizedHost,
      table.normalizedPath,
    ),
    communityHostIndex: index("telegram_community_link_rules_host_idx").on(
      table.communityId,
      table.normalizedHost,
    ),
  }),
);
