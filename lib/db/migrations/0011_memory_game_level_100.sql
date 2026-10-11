-- Expand Memory Game progression and boards without discarding saved scores.
BEGIN;

ALTER TABLE "memory_game_stats"
  DROP CONSTRAINT "memory_game_stats_current_level_check",
  DROP CONSTRAINT "memory_game_stats_non_negative_totals_check";
ALTER TABLE "memory_game_stats"
  ADD CONSTRAINT "memory_game_stats_current_level_check"
    CHECK ("current_level" BETWEEN 1 AND 100),
  ADD CONSTRAINT "memory_game_stats_non_negative_totals_check"
    CHECK (
      "memory_xp" >= 0
      AND "highest_level" BETWEEN 0 AND 100
      AND "levels_completed" >= 0
      AND "games_played" >= 0
      AND "games_completed" >= 0
      AND "total_attempts" >= 0
      AND "successful_attempts" >= 0
      AND "failed_attempts" >= 0
      AND "correct_selections" >= 0
      AND "total_selections" >= 0
      AND "accuracy" BETWEEN 0 AND 100
      AND "best_run" BETWEEN 0 AND 100
      AND "current_run_levels" BETWEEN 0 AND 100
      AND ("fastest_recall_ms" IS NULL OR "fastest_recall_ms" >= 0)
    );

ALTER TABLE "memory_game_attempts"
  DROP CONSTRAINT "memory_game_attempts_level_check",
  DROP CONSTRAINT "memory_game_attempts_grid_check";
ALTER TABLE "memory_game_attempts"
  ADD CONSTRAINT "memory_game_attempts_level_check"
    CHECK ("level" BETWEEN 1 AND 100),
  ADD CONSTRAINT "memory_game_attempts_grid_check"
    CHECK ("grid_rows" BETWEEN 3 AND 10 AND "grid_columns" BETWEEN 3 AND 10);

COMMIT;
