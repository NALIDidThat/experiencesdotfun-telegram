BEGIN;

CREATE TABLE "accountability_goals" (
  "id" serial PRIMARY KEY,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id"),
  "partnership_id" integer REFERENCES "accountability_partnerships"("id"),
  "title" text NOT NULL,
  "description" text,
  "target_date" date,
  "visibility" text NOT NULL DEFAULT 'private',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "accountability_goal_title_length_check"
    CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  CONSTRAINT "accountability_goal_description_length_check"
    CHECK ("description" IS NULL OR char_length("description") <= 500),
  CONSTRAINT "accountability_goal_visibility_check"
    CHECK ("visibility" IN ('private', 'shared')),
  CONSTRAINT "accountability_goal_status_check"
    CHECK ("status" IN ('active', 'completed', 'archived')),
  CONSTRAINT "accountability_goal_visibility_partnership_check"
    CHECK (
      ("visibility" = 'private' AND "partnership_id" IS NULL)
      OR ("visibility" = 'shared' AND "partnership_id" IS NOT NULL)
    )
);

CREATE INDEX "accountability_goal_owner_status_idx"
  ON "accountability_goals" ("owner_user_id", "status", "created_at");
CREATE INDEX "accountability_goal_partnership_idx"
  ON "accountability_goals" ("partnership_id", "created_at");

ALTER TABLE "accountability_commitments"
  ALTER COLUMN "partnership_id" DROP NOT NULL;
ALTER TABLE "accountability_commitments"
  ADD COLUMN "goal_id" integer REFERENCES "accountability_goals"("id");
CREATE INDEX "accountability_commitment_goal_created_idx"
  ON "accountability_commitments" ("goal_id", "created_at");

ALTER TABLE "accountability_check_ins"
  ALTER COLUMN "partnership_id" DROP NOT NULL;

COMMIT;
