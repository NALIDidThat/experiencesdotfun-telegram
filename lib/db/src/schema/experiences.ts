import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    bio: text("bio"),
    city: text("city"),
    country: text("country"),
    interests: text("interests").array().notNull().default([]),
    participationType: text("participation_type"),
    xp: integer("xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    telegramIdIndex: uniqueIndex("users_telegram_id_idx").on(table.telegramId),
    usernameIndex: uniqueIndex("users_username_idx").on(table.username),
  }),
);

export const emailAccountsTable = pgTable(
  "email_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    sessionTokenHash: text("session_token_hash"),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIndex: uniqueIndex("email_accounts_user_id_idx").on(table.userId),
    emailIndex: uniqueIndex("email_accounts_email_idx").on(table.email),
    sessionTokenIndex: uniqueIndex("email_accounts_session_token_idx").on(table.sessionTokenHash),
  }),
);

export const organisationsTable = pgTable("organisations", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => usersTable.id),
  name: text("name").notNull(),
  description: text("description"),
  city: text("city"),
  country: text("country"),
  categories: text("categories").array().notNull().default([]),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const experiencesTable = pgTable("experiences", {
  id: serial("id").primaryKey(),
  organisationId: integer("organisation_id")
    .notNull()
    .references(() => organisationsTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  location: text("location").notNull(),
  city: text("city").notNull(),
  capacity: integer("capacity").notNull(),
  xpReward: integer("xp_reward").notNull(),
  monetaryRewardPence: integer("monetary_reward_pence"),
  whatToBring: text("what_to_bring"),
  whatYouWillDo: text("what_you_will_do"),
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participationsTable = pgTable(
  "participations",
  {
    id: serial("id").primaryKey(),
    experienceId: integer("experience_id")
      .notNull()
      .references(() => experiencesTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("joined"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    attendedAt: timestamp("attended_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rewardStatus: text("reward_status").notNull().default("pending"),
  },
  (table) => ({
    experienceUserIndex: uniqueIndex("participations_experience_user_idx").on(
      table.experienceId,
      table.userId,
    ),
  }),
);

export const friendshipsTable = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterUserId: integer("requester_user_id")
      .notNull()
      .references(() => usersTable.id),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => ({
    requestIndex: uniqueIndex("friendships_request_idx").on(
      table.requesterUserId,
      table.recipientUserId,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable);
export const insertOrganisationSchema = createInsertSchema(organisationsTable);
export const insertExperienceSchema = createInsertSchema(experiencesTable);
export const insertParticipationSchema = createInsertSchema(participationsTable);
export const insertFriendshipSchema = createInsertSchema(friendshipsTable);

export type User = typeof usersTable.$inferSelect;
export type Organisation = typeof organisationsTable.$inferSelect;
export type Experience = typeof experiencesTable.$inferSelect;
export type Participation = typeof participationsTable.$inferSelect;
export type Friendship = typeof friendshipsTable.$inferSelect;

export const experienceCategorySchema = z.enum(["environmental", "education", "community"]);
export const participationTypeSchema = z.enum(["join", "host", "both"]);