import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./experiences";

export type AiAssistantAction =
  | {
      id: string;
      type: "view_experience";
      experienceId: number;
      experienceTitle: string;
      experienceDate: string;
      experienceCity: string;
      label: string;
      friendId: null;
      friendName: null;
    }
  | {
      id: string;
      type: "join_experience";
      experienceId: number;
      experienceTitle: string;
      experienceDate: string;
      experienceCity: string;
      label: string;
      friendId: null;
      friendName: null;
    }
  | {
      id: string;
      type: "challenge_friend";
      experienceId: number;
      experienceTitle: string;
      experienceDate: string;
      experienceCity: string;
      label: string;
      friendId: number;
      friendName: string;
    };

export const aiConversationsTable = pgTable(
  "ai_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerActivityIndex: index("ai_conversations_owner_activity_idx").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

export const aiAssistantMessagesTable = pgTable(
  "ai_assistant_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => aiConversationsTable.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    actions: jsonb("actions")
      .$type<AiAssistantAction[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    conversationHistoryIndex: index("ai_assistant_messages_history_idx").on(
      table.conversationId,
      table.id,
    ),
    roleCheck: check(
      "ai_assistant_messages_role_check",
      sql`${table.role} IN ('user', 'assistant')`,
    ),
  }),
);

export const insertAiConversationSchema = createInsertSchema(
  aiConversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAiAssistantMessageSchema = createInsertSchema(
  aiAssistantMessagesTable,
).omit({ id: true, createdAt: true });

export type AiConversation = typeof aiConversationsTable.$inferSelect;
export type AiAssistantMessage = typeof aiAssistantMessagesTable.$inferSelect;