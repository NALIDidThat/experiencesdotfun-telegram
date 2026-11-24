import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organisationsTable, usersTable } from "./experiences";

export type TelegramCommunityWelcomeButton = {
  label: string;
  url: string;
};

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
    joinCaptchaEnabled: boolean("join_captcha_enabled").notNull().default(false),
    joinCaptchaButtonText: text("join_captcha_button_text")
      .notNull()
      .default("Verify I'm human"),
    welcomeMessage: text("welcome_message").notNull().default(""),
    welcomeButtons: jsonb("welcome_buttons")
      .$type<TelegramCommunityWelcomeButton[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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
    welcomeMessageLengthCheck: check(
      "telegram_communities_welcome_message_length_check",
      sql`char_length(${table.welcomeMessage}) <= 3500`,
    ),
    welcomeButtonsCheck: check(
      "telegram_communities_welcome_buttons_check",
      sql`CASE
        WHEN jsonb_typeof(${table.welcomeButtons}) = 'array'
        THEN jsonb_array_length(${table.welcomeButtons}) <= 6
        ELSE false
      END`,
    ),
    welcomeRequiresMessageCheck: check(
      "telegram_communities_welcome_requires_message_check",
      sql`CASE
        WHEN jsonb_typeof(${table.welcomeButtons}) = 'array'
        THEN char_length(btrim(${table.welcomeMessage})) > 0
          OR jsonb_array_length(${table.welcomeButtons}) = 0
        ELSE false
      END`,
    ),
    riddleIntervalCheck: check(
      "telegram_communities_riddle_interval_check",
      sql`${table.riddleIntervalMinutes} IN (30, 60, 180, 360, 720, 1440)`,
    ),
    joinCaptchaButtonTextCheck: check(
      "telegram_communities_join_captcha_button_text_check",
      sql`char_length(btrim(${table.joinCaptchaButtonText})) BETWEEN 1 AND 64`,
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

export const telegramCommunityModerationEventsTable = pgTable(
  "telegram_community_moderation_events",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramCommunitiesTable.chatId, { onDelete: "cascade" }),
    telegramMessageId: integer("telegram_message_id").notNull(),
    telegramUserId: text("telegram_user_id"),
    ruleType: text("rule_type").notNull(),
    ruleId: integer("rule_id"),
    deletionSucceeded: boolean("deletion_succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatMessageUnique: uniqueIndex("telegram_community_moderation_events_chat_message_idx").on(
      table.chatId,
      table.telegramMessageId,
    ),
    chatCreatedIndex: index("telegram_community_moderation_events_chat_created_idx").on(
      table.chatId,
      table.createdAt,
    ),
    ruleTypeCheck: check(
      "telegram_community_moderation_events_rule_type_check",
      sql`${table.ruleType} IN ('phrase', 'link')`,
    ),
  }),
);

export const telegramCommunityManagementAuditTable = pgTable(
  "telegram_community_management_audit",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramCommunitiesTable.chatId, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetId: integer("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatCreatedIndex: index("telegram_community_management_audit_chat_created_idx").on(
      table.chatId,
      table.createdAt,
    ),
  }),
);
