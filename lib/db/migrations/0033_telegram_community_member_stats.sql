BEGIN;

CREATE TABLE "telegram_community_member_stats" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL
    REFERENCES "telegram_communities" ("chat_id") ON DELETE CASCADE,
  "telegram_user_id" text NOT NULL,
  "name" text NOT NULL,
  "username" text,
  "message_count" integer NOT NULL DEFAULT 0,
  "telegram_joined_at" timestamp with time zone,
  "telegram_left_at" timestamp with time zone,
  "last_message_id" integer,
  "first_observed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "telegram_community_member_stats_message_count_check"
    CHECK ("message_count" >= 0)
);

CREATE UNIQUE INDEX "telegram_community_member_stats_chat_user_idx"
  ON "telegram_community_member_stats" ("chat_id", "telegram_user_id");

CREATE INDEX "telegram_community_member_stats_leaderboard_idx"
  ON "telegram_community_member_stats" ("chat_id", "message_count", "id");

COMMIT;
