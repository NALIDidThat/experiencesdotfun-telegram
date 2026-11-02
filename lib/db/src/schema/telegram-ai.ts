import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const telegramAiMessagesTable = pgTable(
  "telegram_ai_messages",
  {
    id: serial("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    telegramUserId: text("telegram_user_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationHistoryIndex: index("telegram_ai_messages_history_idx").on(
      table.chatId,
      table.telegramUserId,
      table.id,
    ),
    roleCheck: check(
      "telegram_ai_messages_role_check",
      sql`${table.role} IN ('user', 'assistant')`,
    ),
    contentLengthCheck: check(
      "telegram_ai_messages_content_length_check",
      sql`char_length(${table.content}) BETWEEN 1 AND 4000`,
    ),
  }),
);

export type TelegramAiMessage = typeof telegramAiMessagesTable.$inferSelect;
