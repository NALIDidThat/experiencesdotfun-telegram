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
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./experiences";

export const pinnedFriendsTable = pgTable(
  "pinned_friends",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    friendUserId: integer("friend_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userFriendIndex: uniqueIndex("pinned_friends_user_friend_idx").on(
      table.userId,
      table.friendUserId,
    ),
    userPositionIndex: uniqueIndex("pinned_friends_user_position_idx").on(
      table.userId,
      table.position,
    ),
    differentUsersCheck: check(
      "pinned_friends_different_users_check",
      sql`${table.userId} <> ${table.friendUserId}`,
    ),
    positionRangeCheck: check(
      "pinned_friends_position_range_check",
      sql`${table.position} >= 0 AND ${table.position} <= 2`,
    ),
  }),
);

export const organisationPartnershipsTable = pgTable(
  "organisation_partnerships",
  {
    id: serial("id").primaryKey(),
    requesterUserId: integer("requester_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "active", "declined", "ended"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => ({
    organisationPairIndex: uniqueIndex("organisation_partnership_pair_idx").on(
      sql`LEAST(${table.requesterUserId}, ${table.recipientUserId})`,
      sql`GREATEST(${table.requesterUserId}, ${table.recipientUserId})`,
    ),
    requesterStatusIndex: index("organisation_partnership_requester_status_idx").on(
      table.requesterUserId,
      table.status,
    ),
    recipientStatusIndex: index("organisation_partnership_recipient_status_idx").on(
      table.recipientUserId,
      table.status,
    ),
    differentOrganisationsCheck: check(
      "organisation_partnership_different_users_check",
      sql`${table.requesterUserId} <> ${table.recipientUserId}`,
    ),
  }),
);

export const insertPinnedFriendSchema = createInsertSchema(pinnedFriendsTable).omit({
  id: true,
  createdAt: true,
});
export const insertOrganisationPartnershipSchema = createInsertSchema(
  organisationPartnershipsTable,
).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
  endedAt: true,
});

export type PinnedFriend = typeof pinnedFriendsTable.$inferSelect;
export type OrganisationPartnership = typeof organisationPartnershipsTable.$inferSelect;

export const organisationPartnershipStatusSchema = z.enum([
  "pending",
  "active",
  "declined",
  "ended",
]);