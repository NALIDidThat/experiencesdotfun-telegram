-- Additive milestone tracking and per-milestone XP awards.
-- Apply only after confirming the target database environment.
BEGIN;

CREATE TABLE IF NOT EXISTS "experience_milestones" (
  "id" serial PRIMARY KEY NOT NULL,
  "experience_id" integer NOT NULL REFERENCES "experiences"("id") ON DELETE CASCADE,
  "position" integer NOT NULL CHECK ("position" >= 1),
  "title" text NOT NULL CHECK (char_length("title") BETWEEN 1 AND 120),
  "description" text CHECK ("description" IS NULL OR char_length("description") <= 500),
  "xp_reward" integer NOT NULL CHECK ("xp_reward" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "experience_milestones_experience_position_idx"
  ON "experience_milestones" ("experience_id", "position");
CREATE INDEX IF NOT EXISTS "experience_milestones_experience_idx"
  ON "experience_milestones" ("experience_id");

CREATE TABLE IF NOT EXISTS "experience_milestone_submissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "milestone_id" integer NOT NULL REFERENCES "experience_milestones"("id") ON DELETE CASCADE,
  "participation_id" integer NOT NULL REFERENCES "participations"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'submitted'
    CHECK ("status" IN ('submitted', 'verified', 'rejected')),
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "verified_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "experience_milestone_submissions_milestone_participation_idx"
  ON "experience_milestone_submissions" ("milestone_id", "participation_id");
CREATE INDEX IF NOT EXISTS "experience_milestone_submissions_milestone_status_idx"
  ON "experience_milestone_submissions" ("milestone_id", "status");
CREATE INDEX IF NOT EXISTS "experience_milestone_submissions_participation_idx"
  ON "experience_milestone_submissions" ("participation_id");

COMMIT;