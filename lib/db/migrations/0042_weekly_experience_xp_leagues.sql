BEGIN;

ALTER TABLE "xp_awards"
  ADD COLUMN "source_category" TEXT;

UPDATE "xp_awards" AS award
SET "source_category" = experience."category"
FROM "participations" AS participation
INNER JOIN "experiences" AS experience
  ON experience."id" = participation."experience_id"
WHERE award."source_type" = 'experience'
  AND award."source_id" = participation."id"::text
  AND award."user_id" = participation."user_id";

UPDATE "xp_awards" AS award
SET "source_category" = experience."category"
FROM "experience_milestone_submissions" AS submission
INNER JOIN "participations" AS participation
  ON participation."id" = submission."participation_id"
INNER JOIN "experiences" AS experience
  ON experience."id" = participation."experience_id"
WHERE award."source_type" = 'milestone'
  AND award."source_id" = submission."id"::text
  AND award."user_id" = participation."user_id";

ALTER TABLE "xp_awards"
  ADD CONSTRAINT "xp_awards_source_category_check"
  CHECK (
    "source_category" IS NULL
    OR "source_category" IN ('environmental', 'education', 'community')
  );

CREATE INDEX "xp_awards_league_source_history_idx"
  ON "xp_awards" ("source_type", "source_category", "awarded_at", "user_id");

CREATE TABLE "xp_league_memberships" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "opted_in_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "opted_out_at" TIMESTAMPTZ,
  "division" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "xp_league_memberships_category_check"
    CHECK ("category" IN ('environmental', 'education', 'community')),
  CONSTRAINT "xp_league_memberships_division_check"
    CHECK ("division" BETWEEN 1 AND 3),
  CONSTRAINT "xp_league_memberships_opt_out_check"
    CHECK ("opted_out_at" IS NULL OR "opted_out_at" >= "opted_in_at")
);
CREATE UNIQUE INDEX "xp_league_memberships_user_category_idx"
  ON "xp_league_memberships" ("user_id", "category");
CREATE INDEX "xp_league_memberships_category_active_idx"
  ON "xp_league_memberships" ("category", "opted_out_at", "division", "user_id");

CREATE TABLE "xp_league_standings" (
  "id" SERIAL PRIMARY KEY,
  "week_start" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "division" INTEGER NOT NULL,
  "score_xp" INTEGER NOT NULL,
  "rank" INTEGER NOT NULL,
  "movement" TEXT NOT NULL DEFAULT 'held',
  "finalized_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "xp_league_standings_category_check"
    CHECK ("category" IN ('environmental', 'education', 'community')),
  CONSTRAINT "xp_league_standings_division_check"
    CHECK ("division" BETWEEN 1 AND 3),
  CONSTRAINT "xp_league_standings_score_check"
    CHECK ("score_xp" >= 0),
  CONSTRAINT "xp_league_standings_rank_check"
    CHECK ("rank" >= 1),
  CONSTRAINT "xp_league_standings_movement_check"
    CHECK ("movement" IN ('held', 'promoted', 'demoted'))
);
CREATE UNIQUE INDEX "xp_league_standings_week_category_user_idx"
  ON "xp_league_standings" ("week_start", "category", "user_id");
CREATE INDEX "xp_league_standings_user_history_idx"
  ON "xp_league_standings" ("user_id", "category", "week_start");
CREATE INDEX "xp_league_standings_league_history_idx"
  ON "xp_league_standings" ("category", "week_start", "division", "rank");

CREATE TABLE "xp_league_weeks" (
  "id" SERIAL PRIMARY KEY,
  "week_start" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "finalized_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "xp_league_weeks_category_check"
    CHECK ("category" IN ('environmental', 'education', 'community'))
);
CREATE UNIQUE INDEX "xp_league_weeks_week_category_idx"
  ON "xp_league_weeks" ("week_start", "category");
CREATE INDEX "xp_league_weeks_category_week_idx"
  ON "xp_league_weeks" ("category", "week_start");

COMMIT;
