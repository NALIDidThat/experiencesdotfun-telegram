BEGIN;

CREATE TABLE IF NOT EXISTS "feed_push_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expo_push_token" text NOT NULL,
  "platform" text NOT NULL CHECK ("platform" IN ('ios', 'android')),
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "feed_push_tokens_token_length_check"
    CHECK (char_length("expo_push_token") BETWEEN 20 AND 255)
);

CREATE UNIQUE INDEX IF NOT EXISTS "feed_push_tokens_token_idx"
  ON "feed_push_tokens" ("expo_push_token");
CREATE INDEX IF NOT EXISTS "feed_push_tokens_user_enabled_idx"
  ON "feed_push_tokens" ("user_id", "enabled");

COMMIT;
