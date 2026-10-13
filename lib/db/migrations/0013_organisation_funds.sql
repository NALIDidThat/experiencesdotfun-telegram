BEGIN;

CREATE TABLE "organisation_funds" (
  "id" serial PRIMARY KEY,
  "organisation_id" integer NOT NULL REFERENCES "organisations"("id"),
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "description" text NOT NULL,
  "wallet_address" text NOT NULL,
  "goal_sol" numeric(20, 9) NOT NULL CHECK ("goal_sol" > 0),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'closed')),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "organisation_funds_organisation_idx"
  ON "organisation_funds" ("organisation_id");

ALTER TABLE "analytics_events"
  DROP CONSTRAINT "analytics_events_category_check";
ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_category_check"
  CHECK ("category" IN (
    'home', 'explore', 'experiences', 'ai', 'challenges', 'profile', 'notifications',
    'messages', 'direct-message', 'friends', 'friend-profile', 'experience', 'host',
    'create', 'funds', 'email', 'telegram', 'start', 'menu', 'onboarding', 'help',
    'xp', 'progress', 'rank', 'leaderboard', 'requests', 'add', 'accountability',
    'friendship', 'community', 'other'
  ));

COMMIT;
