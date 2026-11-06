import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./experiences";

export const feedVisibilityValues = ["public", "friends", "community", "private"] as const;
export const feedPostKinds = ["goal", "doing", "thought"] as const;
export const feedPostCategories = ["personal", "professional"] as const;
export const feedPostTopics = [
  "general",
  "goals",
  "reflections",
  "experiences",
  "community",
  "career",
  "skills",
  "learning",
  "networking",
  "projects",
] as const;
export const feedReactionTypes = ["support", "celebrate", "insightful"] as const;
export const feedPostReportReasons = [
  "spam",
  "harassment",
  "misinformation",
  "unsafe",
  "other",
] as const;

export const feedActivityEventsTable = pgTable(
  "activity_events",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    visibility: text("visibility", { enum: feedVisibilityValues }).notNull().default("friends"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceUnique: uniqueIndex("activity_events_source_idx").on(
      table.actorId,
      table.type,
      table.targetType,
      table.targetId,
    ),
    createdIndex: index("activity_events_created_idx").on(table.createdAt, table.id),
    actorCreatedIndex: index("activity_events_actor_created_idx").on(
      table.actorId,
      table.createdAt,
      table.id,
    ),
    targetIndex: index("activity_events_target_idx").on(table.targetType, table.targetId),
    typeCheck: check(
      "activity_events_type_check",
      sql`${table.type} IN ('experience_published', 'experience_joined', 'experience_verified', 'xp_earned', 'achievement_unlocked', 'accountability_checkin', 'accountability_goal_completed', 'status_posted')`,
    ),
    targetTypeCheck: check(
      "activity_events_target_type_check",
      sql`${table.targetType} IN ('experience', 'post', 'xp_award', 'achievement', 'accountability')`,
    ),
  }),
);

export const postsTable = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: feedPostKinds }).notNull(),
    body: text("body").notNull(),
    category: text("category", { enum: feedPostCategories }).notNull().default("personal"),
    topic: text("topic", { enum: feedPostTopics }).notNull().default("general"),
    visibility: text("visibility", { enum: feedVisibilityValues }).notNull().default("friends"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    authorCreatedIndex: index("posts_author_created_idx").on(table.authorId, table.createdAt),
    visibilityCreatedIndex: index("posts_visibility_created_idx").on(
      table.visibility,
      table.createdAt,
    ),
    categoryTopicCreatedIndex: index("posts_category_topic_created_idx").on(
      table.category,
      table.topic,
      table.createdAt,
      table.id,
    ),
    bodyLengthCheck: check("posts_body_length_check", sql`char_length(${table.body}) BETWEEN 1 AND 500`),
    categoryCheck: check(
      "posts_category_check",
      sql`${table.category} IN ('personal', 'professional')`,
    ),
    topicCategoryCheck: check(
      "posts_topic_category_check",
      sql`(${table.category} = 'personal' AND ${table.topic} IN ('general', 'goals', 'reflections', 'experiences', 'community'))
        OR (${table.category} = 'professional' AND ${table.topic} IN ('general', 'career', 'skills', 'learning', 'networking', 'projects'))`,
    ),
  }),
);

export const postReactionsTable = pgTable(
  "post_reactions",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type", { enum: feedReactionTypes }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activityUserUnique: uniqueIndex("post_reactions_activity_user_idx").on(
      table.activityId,
      table.userId,
    ),
    activityIndex: index("post_reactions_activity_idx").on(table.activityId),
    activityForeignKey: foreignKey({
      columns: [table.activityId],
      foreignColumns: [feedActivityEventsTable.id],
      name: "post_reactions_activity_id_fkey",
    }).onDelete("cascade"),
  }),
);

export const feedPreferencesTable = pgTable(
  "feed_preferences",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    shareActivityWithFriends: boolean("share_activity_with_friends").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const commentsTable = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activityCreatedIndex: index("comments_activity_created_idx").on(
      table.activityId,
      table.createdAt,
      table.id,
    ),
    bodyLengthCheck: check("comments_body_length_check", sql`char_length(${table.body}) BETWEEN 1 AND 280`),
    activityForeignKey: foreignKey({
      columns: [table.activityId],
      foreignColumns: [feedActivityEventsTable.id],
      name: "comments_activity_id_fkey",
    }).onDelete("cascade"),
  }),
);

export const feedPostReportsTable = pgTable(
  "feed_post_reports",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id").references(
      () => feedActivityEventsTable.id,
      { onDelete: "set null" },
    ),
    reportedActivityId: integer("reported_activity_id").notNull(),
    reportedAuthorId: integer("reported_author_id").notNull(),
    reporterUserId: integer("reporter_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: feedPostReportReasons }).notNull(),
    details: text("details"),
    status: text("status", { enum: ["pending", "reviewed", "dismissed"] })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reporterActivityUnique: uniqueIndex("feed_post_reports_reporter_activity_idx").on(
      table.reporterUserId,
      table.reportedActivityId,
    ),
    reviewIndex: index("feed_post_reports_review_idx").on(table.status, table.createdAt),
    reasonCheck: check(
      "feed_post_reports_reason_check",
      sql`${table.reason} IN ('spam', 'harassment', 'misinformation', 'unsafe', 'other')`,
    ),
    statusCheck: check(
      "feed_post_reports_status_check",
      sql`${table.status} IN ('pending', 'reviewed', 'dismissed')`,
    ),
    detailsLengthCheck: check(
      "feed_post_reports_details_length_check",
      sql`${table.details} IS NULL OR char_length(${table.details}) <= 500`,
    ),
  }),
);

export const feedNotificationsTable = pgTable(
  "feed_notifications",
  {
    id: serial("id").primaryKey(),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    activityId: integer("activity_id")
      .notNull()
      .references(() => feedActivityEventsTable.id, { onDelete: "cascade" }),
    communityChatId: text("community_chat_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipientActivityUnique: uniqueIndex("feed_notifications_recipient_activity_idx").on(
      table.recipientUserId,
      table.activityId,
    ),
    recipientCreatedIndex: index("feed_notifications_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    recipientReadIndex: index("feed_notifications_recipient_read_idx").on(
      table.recipientUserId,
      table.readAt,
    ),
  }),
);

export const feedPushTokensTable = pgTable(
  "feed_push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expoPushToken: text("expo_push_token").notNull(),
    platform: text("platform", { enum: ["ios", "android"] }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("feed_push_tokens_token_idx").on(table.expoPushToken),
    userEnabledIndex: index("feed_push_tokens_user_enabled_idx").on(
      table.userId,
      table.enabled,
    ),
    platformCheck: check(
      "feed_push_tokens_platform_check",
      sql`${table.platform} IN ('ios', 'android')`,
    ),
    tokenLengthCheck: check(
      "feed_push_tokens_token_length_check",
      sql`char_length(${table.expoPushToken}) BETWEEN 20 AND 255`,
    ),
  }),
);

export const insertPostSchema = createInsertSchema(postsTable).omit({
  id: true,
  createdAt: true,
});

export type FeedActivityEvent = typeof feedActivityEventsTable.$inferSelect;
export type FeedPost = typeof postsTable.$inferSelect;
export type FeedPostReaction = typeof postReactionsTable.$inferSelect;
export type FeedComment = typeof commentsTable.$inferSelect;
export type FeedPostReport = typeof feedPostReportsTable.$inferSelect;
export type FeedNotification = typeof feedNotificationsTable.$inferSelect;
export type FeedPushToken = typeof feedPushTokensTable.$inferSelect;