import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./experiences";

export const memoryGameStatsTable = pgTable(
  "memory_game_stats",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    memoryXp: integer("memory_xp").notNull().default(0),
    currentLevel: integer("current_level").notNull().default(1),
    highestLevel: integer("highest_level").notNull().default(0),
    levelsCompleted: integer("levels_completed").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    gamesCompleted: integer("games_completed").notNull().default(0),
    totalAttempts: integer("total_attempts").notNull().default(0),
    successfulAttempts: integer("successful_attempts").notNull().default(0),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    correctSelections: integer("correct_selections").notNull().default(0),
    totalSelections: integer("total_selections").notNull().default(0),
    accuracy: integer("accuracy").notNull().default(0),
    bestRun: integer("best_run").notNull().default(0),
    currentRunLevels: integer("current_run_levels").notNull().default(0),
    currentRunId: uuid("current_run_id"),
    fastestRecallMs: integer("fastest_recall_ms"),
    firstCompletedAt: timestamp("first_completed_at", { withTimezone: true }),
    tutorialSeenAt: timestamp("tutorial_seen_at", { withTimezone: true }),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leaderboard: index("memory_game_stats_leaderboard_idx")
      .on(
        table.memoryXp.desc(),
        table.highestLevel.desc(),
        table.accuracy.desc(),
        table.failedAttempts.asc(),
        table.fastestRecallMs.asc(),
        table.firstCompletedAt.asc(),
        table.userId.asc(),
      )
      .where(sql`${table.memoryXp} > 0`),
    levelCheck: check(
      "memory_game_stats_current_level_check",
      sql`${table.currentLevel} BETWEEN 1 AND 100`,
    ),
    nonNegativeTotalsCheck: check(
      "memory_game_stats_non_negative_totals_check",
      sql`${table.memoryXp} >= 0
        AND ${table.highestLevel} BETWEEN 0 AND 100
        AND ${table.levelsCompleted} >= 0
        AND ${table.gamesPlayed} >= 0
        AND ${table.gamesCompleted} >= 0
        AND ${table.totalAttempts} >= 0
        AND ${table.successfulAttempts} >= 0
        AND ${table.failedAttempts} >= 0
        AND ${table.correctSelections} >= 0
        AND ${table.totalSelections} >= 0
        AND ${table.accuracy} BETWEEN 0 AND 100
        AND ${table.bestRun} BETWEEN 0 AND 100
        AND ${table.currentRunLevels} BETWEEN 0 AND 100
        AND (${table.fastestRecallMs} IS NULL OR ${table.fastestRecallMs} >= 0)`,
    ),
  }),
);

export const memoryGameAttemptsTable = pgTable(
  "memory_game_attempts",
  {
    id: uuid("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    level: integer("level").notNull(),
    gridRows: integer("grid_rows").notNull(),
    gridColumns: integer("grid_columns").notNull(),
    astronautIndices: integer("astronaut_indices").array().notNull(),
    selectedIndices: integer("selected_indices")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    memorizationMs: integer("memorization_ms").notNull(),
    memorizeUntilAt: timestamp("memorize_until_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    status: text("status", {
      enum: ["in_progress", "completed", "failed", "abandoned"],
    })
      .notNull()
      .default("in_progress"),
    correctSelectionCount: integer("correct_selection_count").notNull().default(0),
    elapsedMs: integer("elapsed_ms"),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    leaderboardRankBefore: integer("leaderboard_rank_before"),
    leaderboardRankAfter: integer("leaderboard_rank_after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    activeAttemptPerUser: uniqueIndex("memory_game_attempts_one_active_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'in_progress'`),
    userHistory: index("memory_game_attempts_user_history_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    levelCheck: check(
      "memory_game_attempts_level_check",
      sql`${table.level} BETWEEN 1 AND 100`,
    ),
    gridCheck: check(
      "memory_game_attempts_grid_check",
      sql`${table.gridRows} BETWEEN 3 AND 10 AND ${table.gridColumns} BETWEEN 3 AND 10`,
    ),
    outcomeCheck: check(
      "memory_game_attempts_outcome_check",
      sql`${table.status} IN ('in_progress', 'completed', 'failed', 'abandoned')`,
    ),
    numericCheck: check(
      "memory_game_attempts_numeric_check",
      sql`${table.memorizationMs} > 0
        AND ${table.correctSelectionCount} >= 0
        AND ${table.xpAwarded} IN (0, 5)
        AND (${table.elapsedMs} IS NULL OR ${table.elapsedMs} >= 0)`,
    ),
  }),
);

export type MemoryGameStats = typeof memoryGameStatsTable.$inferSelect;
export type MemoryGameAttempt = typeof memoryGameAttemptsTable.$inferSelect;
