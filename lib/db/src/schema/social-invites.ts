import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./experiences";

export const socialInvitesTable = pgTable(
  "social_invites",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    inviterUserId: integer("inviter_user_id").notNull().references(() => usersTable.id),
    targetUsername: text("target_username").notNull(),
    kind: text("kind", { enum: ["friend", "accountability"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedUserId: integer("claimed_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("social_invites_token_hash_idx").on(table.tokenHash),
    targetIndex: index("social_invites_target_username_idx").on(table.targetUsername),
  }),
);

export type SocialInvite = typeof socialInvitesTable.$inferSelect;