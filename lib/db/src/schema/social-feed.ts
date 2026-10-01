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
export const feedReactionTypes = ["support", "celebrate", "insightful"] as const;

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
    visibility: text("visibility", { enum: feedVisibilityValues }).notNull().default("friends"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    authorCreatedIndex: index("posts_author_created_idx").on(table.authorId, table.createdAt),
    visibilityCreatedIndex: index("posts_visibility_created_idx").on(
      table.visibility,
      table.createdAt,
    ),
    bodyLengthCheck: check("posts_body_length_check", sql`char_length(${table.body}) BETWEEN 1 AND 500`),
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

export const insertPostSchema = createInsertSchema(postsTable).omit({
  id: true,
  createdAt: true,
});

export type FeedActivityEvent = typeof feedActivityEventsTable.$inferSelect;
export type FeedPost = typeof postsTable.$inferSelect;
export type FeedPostReaction = typeof postReactionsTable.$inferSelect;
export type FeedComment = typeof commentsTable.$inferSelect;