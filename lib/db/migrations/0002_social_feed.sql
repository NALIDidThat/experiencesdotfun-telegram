-- Additive activity feed schema. Apply only to the confirmed database target.
BEGIN;

CREATE TABLE IF NOT EXISTS "posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('goal', 'doing', 'thought')),
  "body" text NOT NULL CHECK (char_length("body") BETWEEN 1 AND 500),
  "visibility" text NOT NULL DEFAULT 'friends'
    CHECK ("visibility" IN ('public', 'friends', 'community', 'private')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL
    CHECK ("type" IN ('experience_published', 'experience_joined', 'experience_verified', 'xp_earned', 'achievement_unlocked', 'accountability_checkin', 'accountability_goal_completed', 'status_posted')),
  "target_type" text NOT NULL
    CHECK ("target_type" IN ('experience', 'post', 'xp_award', 'achievement', 'accountability')),
  "target_id" integer NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "visibility" text NOT NULL DEFAULT 'friends'
    CHECK ("visibility" IN ('public', 'friends', 'community', 'private')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "activity_events_source_idx"
  ON "activity_events" ("actor_id", "type", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "activity_events_created_idx"
  ON "activity_events" ("created_at", "id");
CREATE INDEX IF NOT EXISTS "activity_events_actor_created_idx"
  ON "activity_events" ("actor_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "activity_events_target_idx"
  ON "activity_events" ("target_type", "target_id");

CREATE INDEX IF NOT EXISTS "posts_author_created_idx"
  ON "posts" ("author_id", "created_at");
CREATE INDEX IF NOT EXISTS "posts_visibility_created_idx"
  ON "posts" ("visibility", "created_at");

CREATE TABLE IF NOT EXISTS "feed_preferences" (
  "user_id" integer PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "share_activity_with_friends" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "post_reactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "activity_id" integer NOT NULL REFERENCES "activity_events"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reaction_type" text NOT NULL CHECK ("reaction_type" IN ('support', 'celebrate', 'insightful')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "post_reactions_activity_user_idx"
  ON "post_reactions" ("activity_id", "user_id");
CREATE INDEX IF NOT EXISTS "post_reactions_activity_idx"
  ON "post_reactions" ("activity_id");

CREATE TABLE IF NOT EXISTS "comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "activity_id" integer NOT NULL REFERENCES "activity_events"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL CHECK (char_length("body") BETWEEN 1 AND 280),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "comments_activity_created_idx"
  ON "comments" ("activity_id", "created_at", "id");

-- Seed real historical actions without exposing private accountability data.
INSERT INTO "activity_events" ("actor_id", "type", "target_type", "target_id", "metadata", "visibility", "created_at")
SELECT o."owner_user_id", 'experience_published', 'experience', e."id",
       '{"backfilled":true}'::jsonb, 'public', e."created_at"
FROM "experiences" e
JOIN "organisations" o ON o."id" = e."organisation_id"
WHERE e."status" = 'published'
ON CONFLICT ("actor_id", "type", "target_type", "target_id") DO NOTHING;

INSERT INTO "activity_events" ("actor_id", "type", "target_type", "target_id", "metadata", "visibility", "created_at")
SELECT p."user_id", 'experience_joined', 'experience', p."experience_id",
       '{"backfilled":true}'::jsonb, 'private', p."joined_at"
FROM "participations" p
WHERE p."status" IN ('joined', 'attended', 'submitted', 'verified')
ON CONFLICT ("actor_id", "type", "target_type", "target_id") DO NOTHING;

INSERT INTO "activity_events" ("actor_id", "type", "target_type", "target_id", "metadata", "visibility", "created_at")
SELECT p."user_id", 'experience_verified', 'experience', p."experience_id",
       '{"backfilled":true}'::jsonb, 'private', p."verified_at"
FROM "participations" p
WHERE p."status" = 'verified' AND p."verified_at" IS NOT NULL
ON CONFLICT ("actor_id", "type", "target_type", "target_id") DO NOTHING;

INSERT INTO "activity_events" ("actor_id", "type", "target_type", "target_id", "metadata", "visibility", "created_at")
SELECT a."user_id", 'xp_earned', 'xp_award', a."id",
       jsonb_build_object('amount', a."amount", 'sourceTitle', a."source_title"),
       'private', COALESCE(a."redeemed_at", a."awarded_at")
FROM "xp_awards" a
WHERE a."status" = 'redeemed' AND a."amount" > 0
ON CONFLICT ("actor_id", "type", "target_type", "target_id") DO NOTHING;

COMMIT;