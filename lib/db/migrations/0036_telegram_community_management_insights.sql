BEGIN;

ALTER TABLE "telegram_community_member_stats"
  ADD COLUMN "qualifying_message_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "last_qualifying_message_at" timestamptz;

ALTER TABLE "telegram_community_member_stats"
  ADD CONSTRAINT "telegram_community_member_stats_qualifying_message_count_check"
  CHECK ("qualifying_message_count" >= 0);

CREATE TABLE "telegram_community_member_daily_activity" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL
    REFERENCES "telegram_communities" ("chat_id") ON DELETE CASCADE,
  "telegram_user_id" text NOT NULL,
  "activity_date" date NOT NULL,
  "qualifying_message_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "telegram_community_member_daily_activity_count_check"
    CHECK ("qualifying_message_count" >= 0)
);

CREATE UNIQUE INDEX "telegram_community_member_daily_activity_unique_idx"
  ON "telegram_community_member_daily_activity" ("chat_id", "telegram_user_id", "activity_date");
CREATE INDEX "telegram_community_member_daily_activity_day_idx"
  ON "telegram_community_member_daily_activity" ("chat_id", "activity_date");

WITH qualifying AS (
  SELECT cc."chat_id", u."telegram_id", count(*)::integer AS message_count, max(cc."created_at") AS last_at
  FROM "community_contributions" cc
  INNER JOIN "telegram_communities" community ON community."chat_id" = cc."chat_id"
  INNER JOIN "users" u ON u."id" = cc."user_id"
  WHERE cc."contribution_type" = 'telegram_message'
    AND cc."word_count" >= 7
    AND u."telegram_id" IS NOT NULL
    AND cc."created_at" >= community."created_at"
  GROUP BY cc."chat_id", u."telegram_id"
)
UPDATE "telegram_community_member_stats" stats
SET "qualifying_message_count" = qualifying.message_count,
    "last_qualifying_message_at" = qualifying.last_at,
    "updated_at" = now()
FROM qualifying
WHERE stats."chat_id" = qualifying."chat_id"
  AND stats."telegram_user_id" = qualifying."telegram_id";

INSERT INTO "telegram_community_member_daily_activity" (
  "chat_id", "telegram_user_id", "activity_date", "qualifying_message_count"
)
SELECT
  cc."chat_id",
  u."telegram_id",
  (cc."created_at" AT TIME ZONE 'UTC')::date,
  count(*)::integer
FROM "community_contributions" cc
INNER JOIN "telegram_communities" community ON community."chat_id" = cc."chat_id"
INNER JOIN "users" u ON u."id" = cc."user_id"
WHERE cc."contribution_type" = 'telegram_message'
  AND cc."word_count" >= 7
  AND u."telegram_id" IS NOT NULL
  AND cc."created_at" >= community."created_at"
GROUP BY cc."chat_id", u."telegram_id", (cc."created_at" AT TIME ZONE 'UTC')::date;

CREATE TABLE "telegram_community_moderation_events" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL
    REFERENCES "telegram_communities" ("chat_id") ON DELETE CASCADE,
  "telegram_message_id" integer NOT NULL,
  "telegram_user_id" text,
  "rule_type" text NOT NULL,
  "rule_id" integer,
  "deletion_succeeded" boolean NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "telegram_community_moderation_events_rule_type_check"
    CHECK ("rule_type" IN ('phrase', 'link'))
);

CREATE UNIQUE INDEX "telegram_community_moderation_events_chat_message_idx"
  ON "telegram_community_moderation_events" ("chat_id", "telegram_message_id");
CREATE INDEX "telegram_community_moderation_events_chat_created_idx"
  ON "telegram_community_moderation_events" ("chat_id", "created_at");

CREATE TABLE "telegram_community_management_audit" (
  "id" serial PRIMARY KEY,
  "chat_id" text NOT NULL
    REFERENCES "telegram_communities" ("chat_id") ON DELETE CASCADE,
  "actor_user_id" integer NOT NULL
    REFERENCES "users" ("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "target_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "telegram_community_management_audit_chat_created_idx"
  ON "telegram_community_management_audit" ("chat_id", "created_at");

COMMIT;
