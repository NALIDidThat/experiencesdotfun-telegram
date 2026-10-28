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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { experiencesTable, usersTable } from "./experiences";

export const savedExperienceCategoryValues = ["personal", "professional"] as const;
export type SavedExperienceCategory = (typeof savedExperienceCategoryValues)[number];

export const savedExperiencesTable = pgTable(
  "saved_experiences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    experienceId: integer("experience_id")
      .notNull()
      .references(() => experiencesTable.id, { onDelete: "cascade" }),
    category: text("category", { enum: savedExperienceCategoryValues }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userExperienceUnique: uniqueIndex("saved_experiences_user_experience_idx").on(
      table.userId,
      table.experienceId,
    ),
    userCategoryCreatedIndex: index("saved_experiences_user_category_created_idx").on(
      table.userId,
      table.category,
      table.createdAt,
    ),
    categoryCheck: check(
      "saved_experiences_category_check",
      sql`${table.category} IN ('personal', 'professional')`,
    ),
  }),
);

export const personalMemoriesTable = pgTable(
  "personal_memories",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title"),
    body: text("body"),
    photoObjectKeys: jsonb("photo_object_keys").$type<string[]>().notNull().default([]),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUpdatedIndex: index("personal_memories_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
    titleLengthCheck: check(
      "personal_memories_title_length_check",
      sql`${table.title} IS NULL OR char_length(${table.title}) <= 120`,
    ),
    bodyLengthCheck: check(
      "personal_memories_body_length_check",
      sql`${table.body} IS NULL OR char_length(${table.body}) <= 5000`,
    ),
    photoCountCheck: check(
      "personal_memories_photo_count_check",
      sql`jsonb_typeof(${table.photoObjectKeys}) = 'array' AND jsonb_array_length(${table.photoObjectKeys}) <= 5`,
    ),
    linkCountCheck: check(
      "personal_memories_link_count_check",
      sql`jsonb_typeof(${table.links}) = 'array' AND jsonb_array_length(${table.links}) <= 5`,
    ),
    contentCheck: check(
      "personal_memories_content_check",
      sql`NULLIF(btrim(${table.title}), '') IS NOT NULL
        OR NULLIF(btrim(${table.body}), '') IS NOT NULL
        OR jsonb_array_length(${table.photoObjectKeys}) > 0
        OR jsonb_array_length(${table.links}) > 0`,
    ),
  }),
);

export type SavedExperience = typeof savedExperiencesTable.$inferSelect;
export type PersonalMemory = typeof personalMemoriesTable.$inferSelect;
