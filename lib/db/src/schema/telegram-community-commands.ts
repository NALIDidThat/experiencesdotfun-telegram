import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { telegramCommunitiesTable } from "./community-moderation";
import { usersTable } from "./experiences";

export const telegramCommunityCustomCommandsTable = pgTable(
  "telegram_community_custom_commands",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => telegramCommunitiesTable.chatId, { onDelete: "cascade" }),
    command: text("command").notNull(),
    response: text("response").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    commandUnique: uniqueIndex("telegram_community_custom_commands_chat_command_idx").on(
      table.chatId,
      table.command,
    ),
    commandFormatCheck: check(
      "telegram_community_custom_commands_command_format_check",
      sql`${table.command} ~ '^[a-z0-9_]{1,32}$'`,
    ),
    responseLengthCheck: check(
      "telegram_community_custom_commands_response_length_check",
      sql`char_length(btrim(${table.response})) BETWEEN 1 AND 3500`,
    ),
  }),
);

export type TelegramCommunityCustomCommand =
  typeof telegramCommunityCustomCommandsTable.$inferSelect;
