BEGIN;

CREATE TABLE IF NOT EXISTS "feed_post_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "activity_id" integer REFERENCES "activity_events"("id") ON DELETE SET NULL,
  "reported_activity_id" integer NOT NULL,
  "reported_author_id" integer NOT NULL,
  "reporter_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" text NOT NULL CHECK ("reason" IN ('spam', 'harassment', 'misinformation', 'unsafe', 'other')),
  "details" text CHECK ("details" IS NULL OR char_length("details") <= 500),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'reviewed', 'dismissed')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "feed_post_reports_reporter_activity_idx"
  ON "feed_post_reports" ("reporter_user_id", "reported_activity_id");
CREATE INDEX IF NOT EXISTS "feed_post_reports_review_idx"
  ON "feed_post_reports" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "feed_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "recipient_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "activity_id" integer NOT NULL REFERENCES "activity_events"("id") ON DELETE CASCADE,
  "community_chat_id" text NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "feed_notifications_recipient_activity_idx"
  ON "feed_notifications" ("recipient_user_id", "activity_id");
CREATE INDEX IF NOT EXISTS "feed_notifications_recipient_created_idx"
  ON "feed_notifications" ("recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "feed_notifications_recipient_read_idx"
  ON "feed_notifications" ("recipient_user_id", "read_at");

COMMIT;
