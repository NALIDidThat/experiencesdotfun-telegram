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

export type AiResearchSource = {
  title: string;
  url: string;
  publishedAt: string | null;
};

export type AiFlashcard = {
  question: string;
  answer: string;
  sourceUrls: string[];
};

export const learningResearchTable = pgTable(
  "learning_research",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sources: jsonb("sources")
      .$type<AiResearchSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerCreatedIndex: index("learning_research_owner_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    sourceCountCheck: check(
      "learning_research_source_count_check",
      sql`jsonb_typeof(${table.sources}) = 'array' AND jsonb_array_length(${table.sources}) <= 12`,
    ),
  }),
);

export const learningFlashcardDecksTable = pgTable(
  "learning_flashcard_decks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    researchId: integer("research_id").references(
      () => learningResearchTable.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description").notNull(),
    cards: jsonb("cards")
      .$type<AiFlashcard[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerCreatedIndex: index("learning_flashcard_decks_owner_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    cardCountCheck: check(
      "learning_flashcard_decks_card_count_check",
      sql`jsonb_typeof(${table.cards}) = 'array' AND jsonb_array_length(${table.cards}) BETWEEN 4 AND 12`,
    ),
  }),
);

export const insertLearningResearchSchema = createInsertSchema(
  learningResearchTable,
).omit({ id: true, createdAt: true });

export const insertLearningFlashcardDeckSchema = createInsertSchema(
  learningFlashcardDecksTable,
).omit({ id: true, createdAt: true });

export type LearningResearch = typeof learningResearchTable.$inferSelect;
export type LearningFlashcardDeck = typeof learningFlashcardDecksTable.$inferSelect;
