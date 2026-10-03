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
import { usersTable } from "./experiences";

export const directConversationsTable = pgTable(
  "direct_conversations",
  {
    id: serial("id").primaryKey(),
    participantAUserId: integer("participant_a_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    participantBUserId: integer("participant_b_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => ({
    pairIndex: uniqueIndex("direct_conversations_pair_idx").on(
      table.participantAUserId,
      table.participantBUserId,
    ),
    participantAActivityIndex: index("direct_conversations_a_activity_idx").on(
      table.participantAUserId,
      table.lastMessageAt,
    ),
    participantBActivityIndex: index("direct_conversations_b_activity_idx").on(
      table.participantBUserId,
      table.lastMessageAt,
    ),
    differentParticipantsCheck: check(
      "direct_conversations_different_participants_check",
      sql`${table.participantAUserId} < ${table.participantBUserId}`,
    ),
  }),
);

export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => directConversationsTable.id, { onDelete: "cascade" }),
    senderUserId: integer("sender_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => ({
    conversationMessageIndex: index("direct_messages_conversation_message_idx").on(
      table.conversationId,
      table.id,
    ),
    unreadMessageIndex: index("direct_messages_unread_idx")
      .on(table.conversationId, table.senderUserId, table.readAt)
      .where(sql`${table.readAt} IS NULL`),
    senderCreatedIndex: index("direct_messages_sender_created_idx").on(
      table.senderUserId,
      table.createdAt,
    ),
    bodyLengthCheck: check(
      "direct_messages_body_length_check",
      sql`char_length(${table.body}) BETWEEN 1 AND 2000 AND btrim(${table.body}) <> ''`,
    ),
  }),
);