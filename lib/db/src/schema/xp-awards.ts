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

export const xpAwardsTable = pgTable(
  "xp_awards",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    sourceType: text("source_type", {
      enum: ["email_signup", "experience", "milestone", "memory_game"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceTitle: text("source_title").notNull(),
    amount: integer("amount").notNull(),
    status: text("status", { enum: ["pending", "redeemed"] })
      .notNull()
      .default("pending"),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  },
  (table) => ({
    sourceUnique: uniqueIndex("xp_awards_user_source_idx").on(
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
    userHistory: index("xp_awards_user_history_idx").on(
      table.userId,
      table.awardedAt,
    ),
    pendingUser: index("xp_awards_pending_user_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

export type XpAward = typeof xpAwardsTable.$inferSelect;