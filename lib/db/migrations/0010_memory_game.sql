-- Persist profile-bound Memory Game progression and authoritative attempts.
-- This migration is additive and preserves all existing Experiences.fun data.
BEGIN;

CREATE TABLE "memory_game_stats" (
  "user_id" INTEGER PRIMARY KEY
    REFERENCES "users"("id") ON DELETE CASCADE,
  "memory_xp" INTEGER NOT NULL DEFAULT 0,
  "current_level" INTEGER NOT NULL DEFAULT 1,
  "highest_level" INTEGER NOT NULL DEFAULT 0,
  "levels_completed" INTEGER NOT NULL DEFAULT 0,
  "games_played" INTEGER NOT NULL DEFAULT 0,
  "games_completed" INTEGER NOT NULL DEFAULT 0,
  "total_attempts" INTEGER NOT NULL DEFAULT 0,
  "successful_attempts" INTEGER NOT NULL DEFAULT 0,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "correct_selections" INTEGER NOT NULL DEFAULT 0,
  "total_selections" INTEGER NOT NULL DEFAULT 0,
  "accuracy" INTEGER NOT NULL DEFAULT 0,
  "best_run" INTEGER NOT NULL DEFAULT 0,
  "current_run_levels" INTEGER NOT NULL DEFAULT 0,
  "current_run_id" UUID,
  "fastest_recall_ms" INTEGER,
  "first_completed_at" TIMESTAMPTZ,
  "tutorial_seen_at" TIMESTAMPTZ,
  "last_played_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "memory_game_stats_current_level_check"
    CHECK ("current_level" BETWEEN 1 AND 7),
  CONSTRAINT "memory_game_stats_non_negative_totals_check"
    CHECK (
      "memory_xp" >= 0
      AND "highest_level" BETWEEN 0 AND 7
      AND "levels_completed" >= 0
      AND "games_played" >= 0
      AND "games_completed" >= 0
      AND "total_attempts" >= 0
      AND "successful_attempts" >= 0
      AND "failed_attempts" >= 0
      AND "correct_selections" >= 0
      AND "total_selections" >= 0
      AND "accuracy" BETWEEN 0 AND 100
      AND "best_run" BETWEEN 0 AND 7
      AND "current_run_levels" BETWEEN 0 AND 7
      AND ("fastest_recall_ms" IS NULL OR "fastest_recall_ms" >= 0)
    )
);

CREATE INDEX "memory_game_stats_leaderboard_idx"
  ON "memory_game_stats" (
    "memory_xp" DESC,
    "highest_level" DESC,
    "accuracy" DESC,
    "failed_attempts" ASC,
    "fastest_recall_ms" ASC,
    "first_completed_at" ASC,
    "user_id" ASC
  )
  WHERE "memory_xp" > 0;

CREATE TABLE "memory_game_attempts" (
  "id" UUID PRIMARY KEY,
  "user_id" INTEGER NOT NULL
    REFERENCES "users"("id") ON DELETE CASCADE,
  "run_id" UUID NOT NULL,
  "level" INTEGER NOT NULL,
  "grid_rows" INTEGER NOT NULL,
  "grid_columns" INTEGER NOT NULL,
  "astronaut_indices" INTEGER[] NOT NULL,
  "selected_indices" INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  "memorization_ms" INTEGER NOT NULL,
  "memorize_until_at" TIMESTAMPTZ NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "paused_at" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "correct_selection_count" INTEGER NOT NULL DEFAULT 0,
  "elapsed_ms" INTEGER,
  "xp_awarded" INTEGER NOT NULL DEFAULT 0,
  "leaderboard_rank_before" INTEGER,
  "leaderboard_rank_after" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finished_at" TIMESTAMPTZ,
  CONSTRAINT "memory_game_attempts_level_check"
    CHECK ("level" BETWEEN 1 AND 7),
  CONSTRAINT "memory_game_attempts_grid_check"
    CHECK ("grid_rows" BETWEEN 3 AND 4 AND "grid_columns" BETWEEN 3 AND 4),
  CONSTRAINT "memory_game_attempts_outcome_check"
    CHECK ("status" IN ('in_progress', 'completed', 'failed', 'abandoned')),
  CONSTRAINT "memory_game_attempts_numeric_check"
    CHECK (
      "memorization_ms" > 0
      AND "correct_selection_count" >= 0
      AND "xp_awarded" IN (0, 5)
      AND ("elapsed_ms" IS NULL OR "elapsed_ms" >= 0)
    )
);

CREATE UNIQUE INDEX "memory_game_attempts_one_active_user_idx"
  ON "memory_game_attempts" ("user_id")
  WHERE "status" = 'in_progress';
CREATE INDEX "memory_game_attempts_user_history_idx"
  ON "memory_game_attempts" ("user_id", "created_at" DESC);

COMMIT;
