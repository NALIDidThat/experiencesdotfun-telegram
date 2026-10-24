import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatUnique: uniqueIndex("telegram_communities_chat_id_idx").on(table.chatId),
    organisationIndex: index("telegram_communities_organisation_idx").on(table.organisationId),
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
