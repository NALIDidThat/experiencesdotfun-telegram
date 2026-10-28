BEGIN;

CREATE TABLE "saved_experiences" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "experience_id" integer NOT NULL REFERENCES "experiences"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "saved_experiences_category_check"
    CHECK ("category" IN ('personal', 'professional'))
);

CREATE UNIQUE INDEX "saved_experiences_user_experience_idx"
  ON "saved_experiences" ("user_id", "experience_id");
CREATE INDEX "saved_experiences_user_category_created_idx"
  ON "saved_experiences" ("user_id", "category", "created_at");

CREATE TABLE "personal_memories" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text,
  "body" text,
  "photo_object_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "links" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "personal_memories_title_length_check"
    CHECK ("title" IS NULL OR char_length("title") <= 120),
  CONSTRAINT "personal_memories_body_length_check"
    CHECK ("body" IS NULL OR char_length("body") <= 5000),
  CONSTRAINT "personal_memories_photo_count_check"
    CHECK (jsonb_typeof("photo_object_keys") = 'array' AND jsonb_array_length("photo_object_keys") <= 5),
  CONSTRAINT "personal_memories_link_count_check"
    CHECK (jsonb_typeof("links") = 'array' AND jsonb_array_length("links") <= 5),
  CONSTRAINT "personal_memories_content_check"
    CHECK (
      NULLIF(btrim("title"), '') IS NOT NULL
      OR NULLIF(btrim("body"), '') IS NOT NULL
      OR jsonb_array_length("photo_object_keys") > 0
      OR jsonb_array_length("links") > 0
    )
);

CREATE INDEX "personal_memories_user_updated_idx"
  ON "personal_memories" ("user_id", "updated_at");

COMMIT;
