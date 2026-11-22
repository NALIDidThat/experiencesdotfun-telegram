import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import express from "express";
import {
  db,
  friendshipsTable,
  memoryGameAttemptsTable,
  memoryGameStatsTable,
  pool,
  telegramSessionsTable,
  usersTable,
  xpAwardsTable,
} from "@workspace/db";
import memoryGameRouter from "../src/routes/memory-game";

const tokens = new Map([
  [1, "telegram_memory_game_primary"],
  [2, "telegram_memory_game_friend"],
  [3, "telegram_memory_game_stranger"],
  [4, "telegram_memory_game_organisation"],
  [5, "telegram_memory_game_alternate"],
]);
const app = express();
app.use(express.json());
app.use("/api/memory-game", memoryGameRouter);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: "Memory Game test request failed." });
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as { port: number }).port;
let checks = 0;

async function request(
  path: string,
  {
    user = 1,
    method = "GET",
    body,
    expected = 200,
  }: { user?: number; method?: string; body?: unknown; expected?: number } = {},
) {
  const token = tokens.get(user);
  assert.ok(token, `Missing fixture session for profile ${user}`);
  const response = await fetch(`http://127.0.0.1:${port}/api/memory-game${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 180)}`);
  }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks += 1;
  return data;
}

async function enterRecallPhase(attemptId: string) {
  await db
    .update(memoryGameAttemptsTable)
    .set({ memorizeUntilAt: new Date(Date.now() - 10) })
    .where(eq(memoryGameAttemptsTable.id, attemptId));
}

try {
  const sameLogin = "shared-telegram-memory-game-test";
  await db.insert(usersTable).values([
    { id: 1, telegramId: sameLogin, name: "Primary Player", username: "primary_player", userType: "participant" },
    { id: 2, telegramId: "memory-game-friend", name: "Accepted Friend", username: "accepted_friend", userType: "participant" },
    { id: 3, telegramId: "memory-game-stranger", name: "Not a Friend", username: "not_a_friend", userType: "participant" },
    { id: 4, telegramId: "memory-game-organisation", name: "Organisation", username: "memory_org", userType: "organisation" },
    { id: 5, telegramId: sameLogin, name: "Alternate Profile", username: "alternate_player", userType: "participant" },
  ]);
  await db.insert(telegramSessionsTable).values([...tokens.entries()].map(([userId, token]) => ({
    userId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })));
  await db.insert(friendshipsTable).values([
    { requesterUserId: 1, recipientUserId: 2, status: "accepted" },
    { requesterUserId: 1, recipientUserId: 3, status: "pending" },
  ]);

  const initial = await request("/stats");
  assert.equal(initial.needsTutorial, true);
  assert.equal(initial.stats.currentLevel, 1);
  assert.equal(initial.stats.memoryXp, 0);
  const alternateInitial = await request("/stats", { user: 5 });
  assert.equal(alternateInitial.stats.memoryXp, 0, "a second profile under the same login starts with independent progress");

  const firstAttempt = await request("/attempts", { method: "POST", body: { restart: false } });
  assert.equal(firstAttempt.level, 1);
  assert.equal(firstAttempt.phase, "memorize");
  await request(`/attempts/${firstAttempt.id}/submit`, {
    user: 5,
    method: "POST",
    body: { selectedIndices: firstAttempt.astronautIndices },
    expected: 404,
  });
  await request(`/attempts/${firstAttempt.id}/pause`, { user: 5, method: "POST", expected: 404 });

  const paused = await request(`/attempts/${firstAttempt.id}/pause`, { method: "POST" });
  assert.equal(paused.phase, "paused");
  assert.equal(paused.resumePhase, "memorize");
  const resumed = await request(`/attempts/${firstAttempt.id}/resume`, { method: "POST" });
  assert.equal(resumed.phase, "memorize");
  assert.ok(resumed.remainingMs > 0, "resuming during memorization preserves the remaining recall timer");

  await enterRecallPhase(firstAttempt.id);
  const failed = await request(`/attempts/${firstAttempt.id}/submit`, {
    method: "POST",
    body: { selectedIndices: firstAttempt.astronautIndices.slice(1) },
  });
  assert.equal(failed.successful, false);
  assert.equal(failed.xpAwarded, 0);
  assert.equal(failed.officialXpAwarded, 0);
  assert.equal(failed.stats.currentLevel, 1);
  assert.equal(failed.stats.failedAttempts, 1);
  assert.equal(failed.stats.memoryXp, 0);

  const retryAttempt = await request("/attempts", {
    method: "POST",
    body: { restart: true },
  });
  assert.equal(retryAttempt.level, 1, "retry repeats the same level after a failure");
  await enterRecallPhase(retryAttempt.id);
  const succeeded = await request(`/attempts/${retryAttempt.id}/submit`, {
    method: "POST",
    body: { selectedIndices: retryAttempt.astronautIndices },
  });
  assert.equal(succeeded.successful, true);
  assert.equal(succeeded.xpAwarded, 5);
  assert.equal(succeeded.officialXpAwarded, 5);
  assert.equal(succeeded.stats.currentLevel, 2);
  assert.equal(succeeded.stats.memoryXp, 5);
  assert.equal(succeeded.stats.failedAttempts, 1);

  const repeatedSubmit = await request(`/attempts/${retryAttempt.id}/submit`, {
    method: "POST",
    body: { selectedIndices: retryAttempt.astronautIndices },
  });
  assert.equal(repeatedSubmit.successful, true);
  assert.equal(repeatedSubmit.officialXpAwarded, 5);
  assert.equal(repeatedSubmit.stats.memoryXp, 5, "replaying a completed submission never duplicates game score");
  const awardRows = await db
    .select()
    .from(xpAwardsTable);
  const primaryAwards = awardRows.filter((award) => award.userId === 1);
  assert.equal(primaryAwards.length, 1, "a successful attempt creates one profile-bound official XP award");
  assert.equal(primaryAwards[0]?.sourceId, retryAttempt.id);
  assert.equal(primaryAwards[0]?.amount, 5);
  assert.equal(primaryAwards[0]?.status, "pending");
  assert.equal((await request("/stats")).stats.currentLevel, 2, "a fresh stats request reloads saved profile progress");
  const alternateAfter = await request("/stats", { user: 5 });
  assert.equal(alternateAfter.stats.currentLevel, 1);
  assert.equal(alternateAfter.stats.memoryXp, 0);
  assert.equal(alternateAfter.activeAttempt, null);

  await db.insert(memoryGameStatsTable).values([
    { userId: 2, memoryXp: 10, highestLevel: 2, levelsCompleted: 2, accuracy: 100, firstCompletedAt: new Date(Date.now() - 20_000) },
    { userId: 3, memoryXp: 20, highestLevel: 3, levelsCompleted: 3, accuracy: 100, firstCompletedAt: new Date(Date.now() - 30_000) },
    { userId: 4, memoryXp: 100, highestLevel: 10, levelsCompleted: 10, accuracy: 100 },
    { userId: 5, memoryXp: 50, highestLevel: 5, levelsCompleted: 5, accuracy: 100, firstCompletedAt: new Date(Date.now() - 50_000) },
  ]);

  const friends = await request("/leaderboard?scope=friends&page=1&pageSize=20");
  assert.equal(friends.totalPlayers, 2);
  assert.deepEqual(friends.entries.map((entry: { name: string }) => entry.name), ["Accepted Friend", "Primary Player"]);
  assert.equal(friends.currentUserRank, 2);
  assert.equal(friends.currentUserEntry.name, "Primary Player");
  assert.equal(friends.currentUserEntry.rank, 2);
  assert.equal(friends.currentUserEntry.isCurrentUser, true);
  assert.ok(!friends.entries.some((entry: { name: string }) => ["Not a Friend", "Organisation", "Alternate Profile"].includes(entry.name)));

  const global = await request("/leaderboard?scope=global&page=1&pageSize=2");
  assert.equal(global.totalPlayers, 4, "global scope includes every participant profile but excludes organisation accounts");
  assert.deepEqual(global.entries.map((entry: { name: string }) => entry.name), ["Alternate Profile", "Not a Friend"]);
  assert.equal(global.currentUserRank, 4);
  assert.equal(global.currentUserEntry.name, "Primary Player");
  assert.equal(global.currentUserEntry.rank, 4);
  assert.equal(global.currentUserEntry.isCurrentUser, true);
  assert.ok(!global.entries.some((entry: { name: string }) => entry.name === "Organisation"));

  const alternateFriends = await request("/leaderboard?scope=friends", { user: 5 });
  assert.equal(alternateFriends.hasFriends, false);
  assert.deepEqual(alternateFriends.entries, [], "the alternate profile does not inherit another profile's friend list");
  console.log(`Memory Game integration passed: ${checks} authenticated requests covered isolated progress, failures, retries, pause/resume, one-time awards, profile boundaries and leaderboard ranks.`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
