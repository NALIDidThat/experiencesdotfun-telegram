BEGIN;

CREATE TABLE "learning_research" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "prompt" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "learning_research_source_count_check"
    CHECK (
      jsonb_typeof("sources") = 'array'
      AND jsonb_array_length("sources") <= 12
    )
);

CREATE INDEX "learning_research_owner_created_idx"
  ON "learning_research" ("user_id", "created_at");

CREATE TABLE "learning_flashcard_decks" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "research_id" integer REFERENCES "learning_research"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "cards" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "learning_flashcard_decks_card_count_check"
    CHECK (
      jsonb_typeof("cards") = 'array'
      AND jsonb_array_length("cards") BETWEEN 4 AND 12
    )
);

CREATE INDEX "learning_flashcard_decks_owner_created_idx"
  ON "learning_flashcard_decks" ("user_id", "created_at");

CREATE TABLE "telegram_ai_messages" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL,
  "telegram_user_id" text NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "telegram_ai_messages_role_check"
    CHECK ("role" IN ('user', 'assistant')),
  CONSTRAINT "telegram_ai_messages_content_length_check"
    CHECK (char_length("content") BETWEEN 1 AND 4000)
);

CREATE INDEX "telegram_ai_messages_history_idx"
  ON "telegram_ai_messages" ("chat_id", "telegram_user_id", "id");

COMMIT;
