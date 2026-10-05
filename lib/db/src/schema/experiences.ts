import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type PersistedSocialLinks = Partial<
  Record<"website" | "instagram" | "linkedin" | "x" | "youtube", string>
>;

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: text("telegram_id").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    city: text("city"),
    country: text("country"),
    interests: text("interests").array().notNull().default([]),
    socialLinks: jsonb("social_links").$type<PersistedSocialLinks>().notNull().default({}),
    participationType: text("participation_type"),
    userType: text("user_type", { enum: ["participant", "organisation"] }),
    xp: integer("xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    telegramIdentityIndex: index("users_telegram_id_idx").on(table.telegramId),
    unassignedTelegramIndex: uniqueIndex("users_telegram_unassigned_idx")
      .on(table.telegramId)
      .where(sql`${table.userType} IS NULL`),
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
    passwordHash: text("password_hash"),
    supabaseAuthUserId: uuid("supabase_auth_user_id"),
    sessionTokenHash: text("session_token_hash"),
    sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIndex: uniqueIndex("email_accounts_user_id_idx").on(table.userId),
    emailIndex: uniqueIndex("email_accounts_email_idx").on(table.email),
    supabaseAuthUserIdIndex: uniqueIndex("email_accounts_supabase_auth_user_idx").on(
      table.supabaseAuthUserId,
    ),
    sessionTokenIndex: uniqueIndex("email_accounts_session_token_idx").on(table.sessionTokenHash),
  }),
);

export const emailSessionsTable = pgTable(
  "email_sessions",
  {
    id: serial("id").primaryKey(),
    emailAccountId: integer("email_account_id")
      .notNull()
      .references(() => emailAccountsTable.id),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("email_sessions_token_hash_idx").on(table.tokenHash),
    userIdIndex: index("email_sessions_user_id_idx").on(table.userId),
    emailAccountIdIndex: index("email_sessions_email_account_id_idx").on(table.emailAccountId),
  }),
);

export const telegramSessionsTable = pgTable(
  "telegram_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("telegram_sessions_token_hash_idx").on(table.tokenHash),
    userIdIndex: index("telegram_sessions_user_id_idx").on(table.userId),
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
    socialInviteId: integer("social_invite_id"),
  },
  (table) => ({
    requestIndex: uniqueIndex("friendships_request_idx").on(
      table.requesterUserId,
      table.recipientUserId,
    ),
  }),
);

export const friendNotificationsTable = pgTable(
  "friend_notifications",
  {
    id: serial("id").primaryKey(),
    friendshipId: integer("friendship_id")
      .notNull()
      .references(() => friendshipsTable.id),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => usersTable.id),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id),
    type: text("type", {
      enum: ["friend_request", "friend_request_accepted", "friend_request_declined"],
    }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipientCreatedIndex: index("friend_notification_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    recipientReadIndex: index("friend_notification_recipient_read_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
  }),
);

export const analyticsEventSources = ["app", "bot", "server"] as const;
export const analyticsEventNames = [
  "screen_view",
  "auth_signup",
  "auth_login",
  "experience_view",
  "experience_create",
  "experience_edit",
  "experience_cancel",
  "experience_join",
  "experience_waitlist_join",
  "experience_attend",
  "completion_submit",
  "completion_verify",
  "completion_reject",
  "milestone_submit",
  "milestone_verify",
  "milestone_reject",
  "profile_update",
  "friend_request",
  "bot_command",
  "bot_callback",
  "community_contribution",
] as const;
export const analyticsEventCategories = [
  "home",
  "explore",
  "experiences",
  "ai",
  "challenges",
  "profile",
  "notifications",
  "messages",
  "direct-message",
  "friends",
  "friend-profile",
  "experience",
  "host",
  "create",
  "email",
  "memory-game",
  "telegram",
  "start",
  "menu",
  "onboarding",
  "help",
  "xp",
  "progress",
  "rank",
  "leaderboard",
  "requests",
  "add",
  "accountability",
  "friendship",
  "community",
  "other",
] as const;
export const analyticsPlatforms = ["ios", "android", "web", "telegram", "server"] as const;

export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    source: text("source", { enum: analyticsEventSources }).notNull(),
    eventName: text("event_name", { enum: analyticsEventNames }).notNull(),
    category: text("category", { enum: analyticsEventCategories }).notNull(),
    platform: text("platform", { enum: analyticsPlatforms }).notNull(),
    outcome: text("outcome", { enum: ["success", "failure"] }),
    eventDate: date("event_date", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_DATE`),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
  },
  (table) => ({
    sourceDateIndex: index("analytics_events_source_date_idx").on(table.source, table.eventDate),
    retentionIndex: index("analytics_events_expires_at_idx").on(table.expiresAt),
    sourceCheck: check("analytics_events_source_check", sql`${table.source} IN ('app', 'bot', 'server')`),
    eventNameCheck: check(
      "analytics_events_event_name_check",
      sql`${table.eventName} IN ('screen_view', 'auth_signup', 'auth_login', 'experience_view', 'experience_create', 'experience_edit', 'experience_cancel', 'experience_join', 'experience_waitlist_join', 'experience_attend', 'completion_submit', 'completion_verify', 'completion_reject', 'milestone_submit', 'milestone_verify', 'milestone_reject', 'profile_update', 'friend_request', 'bot_command', 'bot_callback', 'community_contribution')`,
    ),
    categoryCheck: check(
      "analytics_events_category_check",
      sql`${table.category} IN ('home', 'explore', 'experiences', 'ai', 'challenges', 'profile', 'notifications', 'messages', 'direct-message', 'friends', 'friend-profile', 'experience', 'host', 'create', 'email', 'telegram', 'start', 'menu', 'onboarding', 'help', 'xp', 'progress', 'rank', 'leaderboard', 'requests', 'add', 'accountability', 'friendship', 'community', 'other')`,
    ),
    platformCheck: check(
      "analytics_events_platform_check",
      sql`${table.platform} IN ('ios', 'android', 'web', 'telegram', 'server')`,
    ),
    outcomeCheck: check(
      "analytics_events_outcome_check",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('success', 'failure')`,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable);
export const insertOrganisationSchema = createInsertSchema(organisationsTable);
export const insertExperienceSchema = createInsertSchema(experiencesTable);
export const insertParticipationSchema = createInsertSchema(participationsTable);
export const insertFriendshipSchema = createInsertSchema(friendshipsTable);
export const insertFriendNotificationSchema = createInsertSchema(friendNotificationsTable);

export type User = typeof usersTable.$inferSelect;
export type Organisation = typeof organisationsTable.$inferSelect;
export type Experience = typeof experiencesTable.$inferSelect;
export type Participation = typeof participationsTable.$inferSelect;
export type Friendship = typeof friendshipsTable.$inferSelect;
export type FriendNotification = typeof friendNotificationsTable.$inferSelect;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type AnalyticsEventCategory = (typeof analyticsEventCategories)[number];
export type AnalyticsPlatform = (typeof analyticsPlatforms)[number];

export const experienceCategorySchema = z.enum(["environmental", "education", "community"]);
export const participationTypeSchema = z.enum(["join", "host", "both"]);
export const userTypeSchema = z.enum(["participant", "organisation"]);
export type UserType = z.infer<typeof userTypeSchema>;