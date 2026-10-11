import { randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  StartMemoryGameAttemptBody,
  SubmitMemoryGameAttemptBody,
} from "@workspace/api-zod";
import { z } from "zod/v4";
import {
  db,
  friendshipsTable,
  memoryGameAttemptsTable,
  memoryGameStatsTable,
  usersTable,
  xpAwardsTable,
  type MemoryGameAttempt as MemoryGameAttemptRow,
  type MemoryGameStats as MemoryGameStatsRow,
} from "@workspace/db";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  chooseAstronautIndices,
  evaluateMemoryGameSelection,
  getDailyMemoryXpAward,
  MAX_MEMORY_GAME_LEVEL,
  MEMORY_GAME_LEVELS,
} from "../lib/memory-game-rules.mjs";

const router: IRouter = Router();
const XP_PER_LEVEL = 5;
const ACTIVE_ATTEMPT_TTL_MS = 15 * 60 * 1000;
const MAX_LEADERBOARD_PLAYERS = 100;
const DEFAULT_PAGE_SIZE = 20;

router.use(requireTelegramUser);
router.use((req, res, next) => {
  const userType = currentUser(req).userType;
  if (userType === "participant") {
    next();
    return;
  }
  if (userType === null) {
    res.status(409).json({
      code: "ACCOUNT_TYPE_REQUIRED",
      message: "Choose a Participant or Organisation account before playing.",
    });
    return;
  }
  res.status(403).json({
    code: "ACCOUNT_TYPE_FORBIDDEN",
    message: "The Memory Game is available to Participant accounts only.",
  });
});

function toStatsView(row?: MemoryGameStatsRow) {
  return {
    currentLevel: row?.currentLevel ?? 1,
    memoryXp: row?.memoryXp ?? 0,
    levelsCompleted: row?.levelsCompleted ?? 0,
    highestLevel: row?.highestLevel ?? 0,
    gamesPlayed: row?.gamesPlayed ?? 0,
    gamesCompleted: row?.gamesCompleted ?? 0,
    totalAttempts: row?.totalAttempts ?? 0,
    successfulAttempts: row?.successfulAttempts ?? 0,
    failedAttempts: row?.failedAttempts ?? 0,
    accuracy: row?.accuracy ?? 0,
    bestRun: row?.bestRun ?? 0,
    fastestRecallMs: row?.fastestRecallMs ?? null,
    lastPlayedAt: row?.lastPlayedAt?.toISOString() ?? null,
    tutorialSeen: Boolean(row?.tutorialSeenAt),
  };
}

function toAttemptView(row: MemoryGameAttemptRow, now: Date) {
  const pausedAt = row.pausedAt;
  const resumePhase =
    pausedAt && row.memorizeUntilAt.getTime() > pausedAt.getTime()
      ? ("memorize" as const)
      : pausedAt
        ? ("recall" as const)
        : null;
  const phase =
    pausedAt
      ? ("paused" as const)
      : now.getTime() < row.memorizeUntilAt.getTime()
        ? ("memorize" as const)
        : ("recall" as const);
  const shouldRevealPositions =
    phase === "memorize" || (phase === "paused" && resumePhase === "memorize");
  const remainingUntil = phase === "paused" ? pausedAt : now;

  return {
    id: row.id,
    level: row.level,
    rows: row.gridRows,
    columns: row.gridColumns,
    astronautCount: row.astronautIndices.length,
    memorizationMs: row.memorizationMs,
    memorizeUntilAt: row.memorizeUntilAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    phase,
    resumePhase,
    remainingMs:
      phase === "memorize" || (phase === "paused" && resumePhase === "memorize")
        ? Math.max(0, row.memorizeUntilAt.getTime() - (remainingUntil?.getTime() ?? now.getTime()))
        : 0,
    astronautIndices: shouldRevealPositions ? row.astronautIndices : [],
    selectedIndices: row.selectedIndices,
    pausedAt: pausedAt?.toISOString() ?? null,
  };
}

function parseAttemptId(req: Request, res: Response): string | undefined {
  const id = req.params.attemptId;
  if (typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  res.status(400).json({ message: "The Memory Game attempt ID is invalid." });
  return undefined;
}

async function lockPlayer(transaction: any, userId: number) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${"memory-game:" + userId}, 0))`,
  );
}

async function readGlobalRank(userId: number): Promise<number | null> {
  const [current] = await db
    .select({
      memoryXp: memoryGameStatsTable.memoryXp,
      highestLevel: memoryGameStatsTable.highestLevel,
      accuracy: memoryGameStatsTable.accuracy,
      failedAttempts: memoryGameStatsTable.failedAttempts,
      fastestRecallMs: memoryGameStatsTable.fastestRecallMs,
      firstCompletedAt: memoryGameStatsTable.firstCompletedAt,
    })
    .from(memoryGameStatsTable)
    .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
    .where(
      and(
        eq(memoryGameStatsTable.userId, userId),
        eq(usersTable.userType, "participant"),
      ),
    )
    .limit(1);

  if (!current || current.memoryXp <= 0) return null;

  const firstCompletedAt = current.firstCompletedAt;
  const fastestRecallMs = current.fastestRecallMs ?? 2147483647;
  const betterThanCurrent = sql`
    (
      ${memoryGameStatsTable.memoryXp} > ${current.memoryXp}
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} > ${current.highestLevel}
      )
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} = ${current.highestLevel}
        AND ${memoryGameStatsTable.accuracy} > ${current.accuracy}
      )
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} = ${current.highestLevel}
        AND ${memoryGameStatsTable.accuracy} = ${current.accuracy}
        AND ${memoryGameStatsTable.failedAttempts} < ${current.failedAttempts}
      )
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} = ${current.highestLevel}
        AND ${memoryGameStatsTable.accuracy} = ${current.accuracy}
        AND ${memoryGameStatsTable.failedAttempts} = ${current.failedAttempts}
        AND COALESCE(${memoryGameStatsTable.fastestRecallMs}, 2147483647) < ${fastestRecallMs}
      )
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} = ${current.highestLevel}
        AND ${memoryGameStatsTable.accuracy} = ${current.accuracy}
        AND ${memoryGameStatsTable.failedAttempts} = ${current.failedAttempts}
        AND COALESCE(${memoryGameStatsTable.fastestRecallMs}, 2147483647) = ${fastestRecallMs}
        AND COALESCE(${memoryGameStatsTable.firstCompletedAt}, 'infinity'::timestamptz)
          < COALESCE(${firstCompletedAt}, 'infinity'::timestamptz)
      )
      OR (
        ${memoryGameStatsTable.memoryXp} = ${current.memoryXp}
        AND ${memoryGameStatsTable.highestLevel} = ${current.highestLevel}
        AND ${memoryGameStatsTable.accuracy} = ${current.accuracy}
        AND ${memoryGameStatsTable.failedAttempts} = ${current.failedAttempts}
        AND COALESCE(${memoryGameStatsTable.fastestRecallMs}, 2147483647) = ${fastestRecallMs}
        AND COALESCE(${memoryGameStatsTable.firstCompletedAt}, 'infinity'::timestamptz)
          = COALESCE(${firstCompletedAt}, 'infinity'::timestamptz)
        AND ${memoryGameStatsTable.userId} < ${userId}
      )
    )
  `;
  const [rankedAhead] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memoryGameStatsTable)
    .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
    .where(
      and(
        eq(usersTable.userType, "participant"),
        gt(memoryGameStatsTable.memoryXp, 0),
        ne(memoryGameStatsTable.userId, userId),
        betterThanCurrent,
      ),
    );
  return Number(rankedAhead?.count ?? 0) + 1;
}

function parsePageQuery(req: Request, res: Response) {
  const parsed = z
    .object({
      scope: z.enum(["friends", "global"]).default("friends"),
      page: z.coerce.number().int().min(1).max(10).default(1),
      pageSize: z.coerce.number().int().min(1).max(20).default(DEFAULT_PAGE_SIZE),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a valid leaderboard page and scope." });
    return undefined;
  }
  if ((parsed.data.page - 1) * parsed.data.pageSize >= MAX_LEADERBOARD_PLAYERS) {
    res.status(400).json({ message: "The Memory Leaderboard shows the top 100 players." });
    return undefined;
  }
  return parsed.data;
}

const leaderboardOrder = [
  desc(memoryGameStatsTable.memoryXp),
  desc(memoryGameStatsTable.highestLevel),
  desc(memoryGameStatsTable.accuracy),
  asc(memoryGameStatsTable.failedAttempts),
  asc(memoryGameStatsTable.fastestRecallMs),
  asc(memoryGameStatsTable.firstCompletedAt),
  asc(memoryGameStatsTable.userId),
];

function toLeaderboardEntry(
  row: {
    userId: number;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    memoryXp: number;
    levelsCompleted: number;
    highestLevel: number;
    gamesPlayed: number;
    bestRun: number;
    accuracy: number;
  },
  rank: number,
  currentUserId: number,
) {
  return {
    rank,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    memoryXp: row.memoryXp,
    levelsCompleted: row.levelsCompleted,
    highestLevel: row.highestLevel,
    gamesPlayed: row.gamesPlayed,
    bestRun: row.bestRun,
    accuracy: row.accuracy,
    isCurrentUser: row.userId === currentUserId,
  };
}

router.get("/stats", async (req, res): Promise<void> => {
  const userId = currentUser(req).id;
  const now = new Date();
  const [stats] = await db
    .select()
    .from(memoryGameStatsTable)
    .where(eq(memoryGameStatsTable.userId, userId))
    .limit(1);
  const [active] = await db
    .select()
    .from(memoryGameAttemptsTable)
    .where(
      and(
        eq(memoryGameAttemptsTable.userId, userId),
        eq(memoryGameAttemptsTable.status, "in_progress"),
        gt(memoryGameAttemptsTable.expiresAt, now),
      ),
    )
    .orderBy(desc(memoryGameAttemptsTable.createdAt))
    .limit(1);

  res.json({
    needsTutorial: !stats?.tutorialSeenAt,
    stats: toStatsView(stats),
    activeAttempt: active ? toAttemptView(active, now) : null,
  });
});

router.post("/attempts", async (req, res): Promise<void> => {
  const parsed = StartMemoryGameAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose whether to resume or restart the level." });
    return;
  }

  const userId = currentUser(req).id;
  const now = new Date();
  const result = await db.transaction(async (transaction) => {
    await lockPlayer(transaction, userId);

    let [stats] = await transaction
      .select()
      .from(memoryGameStatsTable)
      .where(eq(memoryGameStatsTable.userId, userId))
      .for("update")
      .limit(1);
    if (!stats) {
      const [createdStats] = await transaction
        .insert(memoryGameStatsTable)
        .values({ userId, tutorialSeenAt: now })
        .onConflictDoNothing()
        .returning();
      stats =
        createdStats ??
        (await transaction
          .select()
          .from(memoryGameStatsTable)
          .where(eq(memoryGameStatsTable.userId, userId))
          .for("update")
          .limit(1))[0];
    }
    if (!stats) throw new Error("Memory Game stats could not be initialized.");

    const [active] = await transaction
      .select()
      .from(memoryGameAttemptsTable)
      .where(
        and(
          eq(memoryGameAttemptsTable.userId, userId),
          eq(memoryGameAttemptsTable.status, "in_progress"),
        ),
      )
      .orderBy(desc(memoryGameAttemptsTable.createdAt))
      .for("update")
      .limit(1);

    if (active && active.expiresAt.getTime() <= now.getTime()) {
      await transaction
        .update(memoryGameAttemptsTable)
        .set({ status: "abandoned", finishedAt: now, pausedAt: null })
        .where(eq(memoryGameAttemptsTable.id, active.id));
    } else if (active && !parsed.data.restart) {
      if (!stats.tutorialSeenAt) {
        await transaction
          .update(memoryGameStatsTable)
          .set({ tutorialSeenAt: now, updatedAt: now })
          .where(eq(memoryGameStatsTable.userId, userId));
      }
      return { attempt: active };
    } else if (active) {
      await transaction
        .update(memoryGameAttemptsTable)
        .set({ status: "abandoned", finishedAt: now, pausedAt: null })
        .where(eq(memoryGameAttemptsTable.id, active.id));
    }

    const level = stats.currentLevel;
    const levelConfig = MEMORY_GAME_LEVELS[level - 1];
    if (!levelConfig) throw new Error("Stored Memory Game level is invalid.");
    const runId = stats.currentRunId ?? randomUUID();
    const astronautIndices = chooseAstronautIndices(
      levelConfig.rows * levelConfig.columns,
      levelConfig.astronautCount,
      randomInt,
    );
    const attemptId = randomUUID();
    const attemptValues = {
      id: attemptId,
      userId,
      runId,
      level,
      gridRows: levelConfig.rows,
      gridColumns: levelConfig.columns,
      astronautIndices,
      memorizationMs: levelConfig.memorizationMs,
      memorizeUntilAt: new Date(now.getTime() + levelConfig.memorizationMs),
      expiresAt: new Date(now.getTime() + ACTIVE_ATTEMPT_TTL_MS),
      createdAt: now,
    };
    const [attempt] = await transaction
      .insert(memoryGameAttemptsTable)
      .values(attemptValues)
      .returning();
    if (!attempt) throw new Error("Memory Game attempt could not be created.");

    await transaction
      .update(memoryGameStatsTable)
      .set({
        currentRunId: runId,
        gamesPlayed: stats.currentRunId ? stats.gamesPlayed : stats.gamesPlayed + 1,
        tutorialSeenAt: stats.tutorialSeenAt ?? now,
        lastPlayedAt: now,
        updatedAt: now,
      })
      .where(eq(memoryGameStatsTable.userId, userId));

    return { attempt };
  });

  res.json(toAttemptView(result.attempt, now));
});

router.post("/attempts/:attemptId/submit", async (req, res): Promise<void> => {
  const attemptId = parseAttemptId(req, res);
  if (!attemptId) return;
  const parsed = SubmitMemoryGameAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Select unique tiles from the game grid." });
    return;
  }
  if (new Set(parsed.data.selectedIndices).size !== parsed.data.selectedIndices.length) {
    res.status(400).json({ message: "A tile can only be selected once." });
    return;
  }

  const userId = currentUser(req).id;
  const now = new Date();
  const globalRankBefore = await readGlobalRank(userId);
  const outcome = await db.transaction(async (transaction) => {
    await lockPlayer(transaction, userId);
    const [attempt] = await transaction
      .select()
      .from(memoryGameAttemptsTable)
      .where(
        and(
          eq(memoryGameAttemptsTable.id, attemptId),
          eq(memoryGameAttemptsTable.userId, userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!attempt) return { kind: "not-found" as const };

    let [stats] = await transaction
      .select()
      .from(memoryGameStatsTable)
      .where(eq(memoryGameStatsTable.userId, userId))
      .for("update")
      .limit(1);
    if (!stats) return { kind: "not-found" as const };

    if (attempt.status === "completed" || attempt.status === "failed") {
      const [existingAward] = await transaction
        .select({ amount: xpAwardsTable.amount })
        .from(xpAwardsTable)
        .where(and(
          eq(xpAwardsTable.userId, userId),
          eq(xpAwardsTable.sourceType, "memory_game"),
          eq(xpAwardsTable.sourceId, attempt.id),
        ))
        .limit(1);
      return {
        kind: "result" as const,
        attempt,
        stats,
        newlyCompleted: false,
        officialXpAwarded: existingAward?.amount ?? 0,
      };
    }
    if (attempt.status !== "in_progress") return { kind: "conflict" as const };
    if (attempt.pausedAt) return { kind: "paused" as const };
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      await transaction
        .update(memoryGameAttemptsTable)
        .set({ status: "abandoned", finishedAt: now })
        .where(eq(memoryGameAttemptsTable.id, attempt.id));
      return { kind: "expired" as const };
    }
    const tileCount = attempt.gridRows * attempt.gridColumns;
    if (parsed.data.selectedIndices.some((index) => index >= tileCount)) {
      return { kind: "invalid-selection" as const };
    }
    if (now.getTime() < attempt.memorizeUntilAt.getTime()) {
      return { kind: "memorizing" as const };
    }

    const selection = evaluateMemoryGameSelection(
      attempt.astronautIndices,
      parsed.data.selectedIndices,
    );
    const elapsedMs = Math.max(0, now.getTime() - attempt.memorizeUntilAt.getTime());
    const successful = selection.successful;
    const xpAwarded = successful ? XP_PER_LEVEL : 0;
    let officialXpAwarded = 0;
    if (successful) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const [dailyTotal] = await transaction
        .select({ total: sql<number>`coalesce(sum(${xpAwardsTable.amount}), 0)::int` })
        .from(xpAwardsTable)
        .where(and(
          eq(xpAwardsTable.userId, userId),
          eq(xpAwardsTable.sourceType, "memory_game"),
          gte(xpAwardsTable.awardedAt, dayStart),
          lt(xpAwardsTable.awardedAt, dayEnd),
        ));
      officialXpAwarded = getDailyMemoryXpAward(Number(dailyTotal?.total ?? 0));
      if (officialXpAwarded > 0) {
        const [award] = await transaction
          .insert(xpAwardsTable)
          .values({
            userId,
            sourceType: "memory_game",
            sourceId: attempt.id,
            sourceTitle: `Memory Game · Level ${attempt.level}`,
            amount: officialXpAwarded,
            status: "pending",
            awardedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: xpAwardsTable.id });
        if (!award) throw new Error("The Memory Game XP award already exists for this attempt.");
      }
    }

    const totalAttempts = stats.totalAttempts + 1;
    const successfulAttempts = stats.successfulAttempts + (successful ? 1 : 0);
    const failedAttempts = stats.failedAttempts + (successful ? 0 : 1);
    const correctSelections = stats.correctSelections + selection.correctSelections;
    const totalSelections = stats.totalSelections + selection.totalSelections;
    const currentRunLevels =
      stats.currentRunLevels + (successful ? 1 : 0);
    const runCompleted = successful && attempt.level === MAX_MEMORY_GAME_LEVEL;
    const nextStatsValues = {
      memoryXp: stats.memoryXp + (successful ? XP_PER_LEVEL : 0),
      currentLevel: runCompleted
        ? 1
        : successful
          ? attempt.level + 1
          : attempt.level,
      highestLevel: Math.max(stats.highestLevel, successful ? attempt.level : 0),
      levelsCompleted: stats.levelsCompleted + (successful ? 1 : 0),
      gamesCompleted: stats.gamesCompleted + (runCompleted ? 1 : 0),
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      correctSelections,
      totalSelections,
      accuracy:
        totalSelections > 0
          ? Math.round((correctSelections / totalSelections) * 100)
          : 0,
      bestRun: Math.max(stats.bestRun, currentRunLevels),
      currentRunLevels: runCompleted ? 0 : currentRunLevels,
      currentRunId: runCompleted ? null : stats.currentRunId,
      fastestRecallMs:
        successful && (stats.fastestRecallMs === null || elapsedMs < stats.fastestRecallMs)
          ? elapsedMs
          : stats.fastestRecallMs,
      firstCompletedAt: successful ? (stats.firstCompletedAt ?? now) : stats.firstCompletedAt,
      lastPlayedAt: now,
      updatedAt: now,
    };
    const [updatedStats] = await transaction
      .update(memoryGameStatsTable)
      .set(nextStatsValues)
      .where(eq(memoryGameStatsTable.userId, userId))
      .returning();
    const [updatedAttempt] = await transaction
      .update(memoryGameAttemptsTable)
      .set({
        status: successful ? "completed" : "failed",
        selectedIndices: parsed.data.selectedIndices,
        correctSelectionCount: selection.correctSelections,
        elapsedMs,
        xpAwarded,
        leaderboardRankBefore: successful ? globalRankBefore : null,
        leaderboardRankAfter: null,
        finishedAt: now,
      })
      .where(eq(memoryGameAttemptsTable.id, attempt.id))
      .returning();
    if (!updatedAttempt || !updatedStats) {
      throw new Error("The Memory Game result could not be saved.");
    }
    stats = updatedStats;
    return {
      kind: "result" as const,
      attempt: updatedAttempt,
      stats,
      newlyCompleted: successful,
      officialXpAwarded,
    };
  });

  if (outcome.kind === "not-found") {
    res.status(404).json({ message: "Memory Game attempt not found." });
    return;
  }
  if (outcome.kind === "conflict") {
    res.status(409).json({ message: "This Memory Game attempt is no longer active." });
    return;
  }
  if (outcome.kind === "paused") {
    res.status(409).json({ message: "Resume the Memory Game before submitting." });
    return;
  }
  if (outcome.kind === "expired") {
    res.status(409).json({ message: "This attempt expired. Start the level again." });
    return;
  }
  if (outcome.kind === "memorizing") {
    res.status(409).json({ message: "Keep memorizing until the timer ends." });
    return;
  }
  if (outcome.kind === "invalid-selection") {
    res.status(400).json({ message: "One or more selected tiles are outside the game grid." });
    return;
  }

  let rankAfter = outcome.attempt.leaderboardRankAfter;
  if (outcome.newlyCompleted) {
    rankAfter = await readGlobalRank(userId);
    await db
      .update(memoryGameAttemptsTable)
      .set({ leaderboardRankAfter: rankAfter })
      .where(eq(memoryGameAttemptsTable.id, outcome.attempt.id));
  } else if (outcome.attempt.status === "completed" && rankAfter === null) {
    rankAfter = await readGlobalRank(userId);
  }

  res.json({
    attemptId: outcome.attempt.id,
    successful: outcome.attempt.status === "completed",
    level: outcome.attempt.level,
    correctTileIndices: outcome.attempt.astronautIndices,
    selectedIndices: outcome.attempt.selectedIndices,
    correctSelections: outcome.attempt.correctSelectionCount,
    xpAwarded: outcome.attempt.xpAwarded,
    officialXpAwarded: outcome.officialXpAwarded ?? 0,
    runCompleted:
      outcome.attempt.status === "completed" &&
      outcome.attempt.level === MAX_MEMORY_GAME_LEVEL,
    runXpAwarded:
      outcome.attempt.status === "completed" &&
      outcome.attempt.level === MAX_MEMORY_GAME_LEVEL
        ? XP_PER_LEVEL * MAX_MEMORY_GAME_LEVEL
        : null,
    globalRankBefore: outcome.attempt.leaderboardRankBefore,
    globalRankAfter: rankAfter,
    stats: toStatsView(outcome.stats),
  });
});

router.post("/attempts/:attemptId/pause", async (req, res): Promise<void> => {
  const attemptId = parseAttemptId(req, res);
  if (!attemptId) return;
  const userId = currentUser(req).id;
  const now = new Date();

  const result = await db.transaction(async (transaction) => {
    await lockPlayer(transaction, userId);
    const [attempt] = await transaction
      .select()
      .from(memoryGameAttemptsTable)
      .where(
        and(
          eq(memoryGameAttemptsTable.id, attemptId),
          eq(memoryGameAttemptsTable.userId, userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!attempt) return { kind: "not-found" as const };
    if (attempt.status !== "in_progress") return { kind: "conflict" as const };
    if (attempt.pausedAt) return { kind: "paused" as const, attempt };
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      await transaction
        .update(memoryGameAttemptsTable)
        .set({ status: "abandoned", finishedAt: now })
        .where(eq(memoryGameAttemptsTable.id, attemptId));
      return { kind: "expired" as const };
    }
    const [paused] = await transaction
      .update(memoryGameAttemptsTable)
      .set({ pausedAt: now })
      .where(eq(memoryGameAttemptsTable.id, attemptId))
      .returning();
    return paused
      ? { kind: "paused" as const, attempt: paused }
      : { kind: "not-found" as const };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ message: "Memory Game attempt not found." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ message: "This Memory Game attempt is no longer active." });
    return;
  }
  if (result.kind === "expired") {
    res.status(409).json({ message: "This attempt expired. Start the level again." });
    return;
  }
  res.json(toAttemptView(result.attempt, now));
});

router.post("/attempts/:attemptId/resume", async (req, res): Promise<void> => {
  const attemptId = parseAttemptId(req, res);
  if (!attemptId) return;
  const userId = currentUser(req).id;
  const now = new Date();

  const result = await db.transaction(async (transaction) => {
    await lockPlayer(transaction, userId);
    const [attempt] = await transaction
      .select()
      .from(memoryGameAttemptsTable)
      .where(
        and(
          eq(memoryGameAttemptsTable.id, attemptId),
          eq(memoryGameAttemptsTable.userId, userId),
        ),
      )
      .for("update")
      .limit(1);
    if (!attempt) return { kind: "not-found" as const };
    if (attempt.status !== "in_progress") return { kind: "conflict" as const };
    if (!attempt.pausedAt) return { kind: "resumed" as const, attempt };
    if (attempt.expiresAt.getTime() <= now.getTime()) {
      await transaction
        .update(memoryGameAttemptsTable)
        .set({ status: "abandoned", finishedAt: now, pausedAt: null })
        .where(eq(memoryGameAttemptsTable.id, attemptId));
      return { kind: "expired" as const };
    }

    const pauseDuration = Math.max(0, now.getTime() - attempt.pausedAt.getTime());
    const wasMemorizing =
      attempt.memorizeUntilAt.getTime() > attempt.pausedAt.getTime();
    const [resumed] = await transaction
      .update(memoryGameAttemptsTable)
      .set({
        pausedAt: null,
        memorizeUntilAt: wasMemorizing
          ? new Date(attempt.memorizeUntilAt.getTime() + pauseDuration)
          : attempt.memorizeUntilAt,
        expiresAt: new Date(attempt.expiresAt.getTime() + pauseDuration),
      })
      .where(eq(memoryGameAttemptsTable.id, attemptId))
      .returning();
    return resumed
      ? { kind: "resumed" as const, attempt: resumed }
      : { kind: "not-found" as const };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ message: "Memory Game attempt not found." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ message: "This Memory Game attempt is no longer active." });
    return;
  }
  if (result.kind === "expired") {
    res.status(409).json({ message: "This attempt expired. Start the level again." });
    return;
  }
  res.json(toAttemptView(result.attempt, now));
});

router.get("/leaderboard", async (req, res): Promise<void> => {
  const parsed = parsePageQuery(req, res);
  if (!parsed) return;
  const userId = currentUser(req).id;
  const offset = (parsed.page - 1) * parsed.pageSize;
  const friendLinks = await db
    .select({
      requesterUserId: friendshipsTable.requesterUserId,
      recipientUserId: friendshipsTable.recipientUserId,
    })
    .from(friendshipsTable)
    .where(
      and(
        eq(friendshipsTable.status, "accepted"),
        or(
          eq(friendshipsTable.requesterUserId, userId),
          eq(friendshipsTable.recipientUserId, userId),
        ),
      ),
    );
  const friendIds = [
    ...new Set(
      friendLinks
        .map((friendship) =>
          friendship.requesterUserId === userId
            ? friendship.recipientUserId
            : friendship.requesterUserId,
        )
        .filter((friendId) => friendId !== userId),
    ),
  ];
  const hasFriends = friendIds.length > 0;

  if (parsed.scope === "friends") {
    if (!hasFriends) {
      res.json({
        scope: "friends",
        page: parsed.page,
        pageSize: parsed.pageSize,
        totalPlayers: 0,
        hasMore: false,
        hasFriends: false,
        entries: [],
        currentUserRank: null,
        currentUserEntry: null,
      });
      return;
    }

    const rankedRows = await db
      .select({
        userId: memoryGameStatsTable.userId,
        name: usersTable.name,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
        memoryXp: memoryGameStatsTable.memoryXp,
        levelsCompleted: memoryGameStatsTable.levelsCompleted,
        highestLevel: memoryGameStatsTable.highestLevel,
        gamesPlayed: memoryGameStatsTable.gamesPlayed,
        bestRun: memoryGameStatsTable.bestRun,
        accuracy: memoryGameStatsTable.accuracy,
      })
      .from(memoryGameStatsTable)
      .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
      .where(
        and(
          eq(usersTable.userType, "participant"),
          gt(memoryGameStatsTable.memoryXp, 0),
          inArray(memoryGameStatsTable.userId, [userId, ...friendIds]),
        ),
      )
      .orderBy(...leaderboardOrder);
    const eligibleRows = rankedRows.slice(0, MAX_LEADERBOARD_PLAYERS);
    const pageRows = eligibleRows.slice(offset, offset + parsed.pageSize);
    const currentUserIndex = eligibleRows.findIndex((row) => row.userId === userId);
    const currentUserRank = currentUserIndex >= 0 ? currentUserIndex + 1 : null;
    const currentUserRow =
      currentUserIndex >= 0 ? eligibleRows[currentUserIndex] : undefined;

    res.json({
      scope: "friends",
      page: parsed.page,
      pageSize: parsed.pageSize,
      totalPlayers: rankedRows.length,
      hasMore:
        offset + pageRows.length <
        Math.min(rankedRows.length, MAX_LEADERBOARD_PLAYERS),
      hasFriends,
      entries: pageRows.map((row, index) =>
        toLeaderboardEntry(row, offset + index + 1, userId),
      ),
      currentUserRank,
      currentUserEntry: currentUserRow
        ? toLeaderboardEntry(currentUserRow, currentUserIndex + 1, userId)
        : null,
    });
    return;
  }

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memoryGameStatsTable)
    .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
    .where(
      and(
        eq(usersTable.userType, "participant"),
        gt(memoryGameStatsTable.memoryXp, 0),
      ),
    );
  const totalPlayers = Number(totalRows[0]?.count ?? 0);
  const pageRows = await db
    .select({
      userId: memoryGameStatsTable.userId,
      name: usersTable.name,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
      memoryXp: memoryGameStatsTable.memoryXp,
      levelsCompleted: memoryGameStatsTable.levelsCompleted,
      highestLevel: memoryGameStatsTable.highestLevel,
      gamesPlayed: memoryGameStatsTable.gamesPlayed,
      bestRun: memoryGameStatsTable.bestRun,
      accuracy: memoryGameStatsTable.accuracy,
    })
    .from(memoryGameStatsTable)
    .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
    .where(
      and(
        eq(usersTable.userType, "participant"),
        gt(memoryGameStatsTable.memoryXp, 0),
      ),
    )
    .orderBy(...leaderboardOrder)
    .limit(parsed.pageSize)
    .offset(offset);
  const currentUserRank = await readGlobalRank(userId);
  let currentUserRow:
    | {
        userId: number;
        name: string;
        username: string | null;
        avatarUrl: string | null;
        memoryXp: number;
        levelsCompleted: number;
        highestLevel: number;
        gamesPlayed: number;
        bestRun: number;
        accuracy: number;
      }
    | undefined;
  if (currentUserRank) {
    const [row] = await db
      .select({
        userId: memoryGameStatsTable.userId,
        name: usersTable.name,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
        memoryXp: memoryGameStatsTable.memoryXp,
        levelsCompleted: memoryGameStatsTable.levelsCompleted,
        highestLevel: memoryGameStatsTable.highestLevel,
        gamesPlayed: memoryGameStatsTable.gamesPlayed,
        bestRun: memoryGameStatsTable.bestRun,
        accuracy: memoryGameStatsTable.accuracy,
      })
      .from(memoryGameStatsTable)
      .innerJoin(usersTable, eq(usersTable.id, memoryGameStatsTable.userId))
      .where(eq(memoryGameStatsTable.userId, userId))
      .limit(1);
    currentUserRow = row;
  }
  const visiblePlayers = Math.min(totalPlayers, MAX_LEADERBOARD_PLAYERS);

  res.json({
    scope: "global",
    page: parsed.page,
    pageSize: parsed.pageSize,
    totalPlayers,
    hasMore: offset + pageRows.length < visiblePlayers,
    hasFriends,
    entries: pageRows.map((row, index) =>
      toLeaderboardEntry(row, offset + index + 1, userId),
    ),
    currentUserRank,
    currentUserEntry:
      currentUserRow && currentUserRank
        ? toLeaderboardEntry(currentUserRow, currentUserRank, userId)
        : null,
  });
});

export default router;
