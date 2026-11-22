import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { getAppPreviewUrl } from "./preview-test-config.mjs";

const viewport = { width: 390, height: 740 };
const sessionToken = "email_memory-game-mobile-test";
const chromiumPath = process.env.CHROMIUM_PATH
  ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : "chromium");
const player = {
  id: 940,
  createdAt: "2026-10-01T00:00:00.000Z",
  telegramId: null,
  email: "memory.game@example.test",
  name: "Memory QA",
  username: "memory_qa",
  avatarUrl: null,
  bio: null,
  city: "London",
  country: "UK",
  socialLinks: {},
  interests: ["environmental"],
  participationType: null,
  userType: "participant",
  organisation: null,
  xp: 0,
  level: "Explorer",
  levelProgress: 0,
  nextLevelXp: 500,
  xpToNextLevel: 500,
  completedCount: 0,
  hostedCount: 0,
  rewardsPence: 0,
};

const mockApiSource = `(() => {
  const token = ${JSON.stringify(sessionToken)};
  const player = ${JSON.stringify(player)};
  localStorage.setItem("@experiences/auth-token", token);
  const storageKey = "__memoryGameFlowFixture";
  const blankStats = () => ({
    currentLevel: 1, memoryXp: 0, levelsCompleted: 0, highestLevel: 0,
    gamesPlayed: 0, gamesCompleted: 0, totalAttempts: 0, successfulAttempts: 0,
    failedAttempts: 0, accuracy: 0, bestRun: 0, fastestRecallMs: null,
    lastPlayedAt: null, tutorialSeen: false,
  });
  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) ?? null;
    } catch {
      return null;
    }
  };
  const writeState = (state) => localStorage.setItem(storageKey, JSON.stringify(state));
  if (!readState()) writeState({ stats: blankStats(), activeAttempt: null, starts: 0 });
  window.__memoryGameApiTraffic = JSON.parse(localStorage.getItem("__memoryGameApiTraffic") ?? "[]");
  window.__memoryGameUnexpectedApi = JSON.parse(localStorage.getItem("__memoryGameUnexpectedApi") ?? "[]");
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl, window.location.href);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);

    const method = String(init.method ?? input.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    window.__memoryGameApiTraffic.push({
      method,
      path: url.pathname + url.search,
      authorization: headers.get("authorization"),
    });
    localStorage.setItem("__memoryGameApiTraffic", JSON.stringify(window.__memoryGameApiTraffic));
    const respond = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
    if (url.pathname === "/api/me" && method === "GET") {
      return headers.get("authorization") === "Bearer " + token
        ? respond(player)
        : respond({ message: "The test session was not restored." }, 401);
    }
    if (url.pathname === "/api/explore/activity" && method === "GET") {
      return respond({ cities: [], experiences: [], total: 0 });
    }
    if (url.pathname === "/api/memory-game/stats" && method === "GET") {
      const state = readState();
      return respond({
        needsTutorial: state.stats.totalAttempts === 0,
        stats: state.stats,
        activeAttempt: state.activeAttempt,
      });
    }
    if (url.pathname === "/api/memory-game/attempts" && method === "POST") {
      const state = readState();
      state.starts += 1;
      state.stats.gamesPlayed += state.stats.currentLevel === 1 && state.stats.totalAttempts === 0 ? 1 : 0;
      state.stats.tutorialSeen = true;
      state.activeAttempt = {
        id: "f5a8a6fa-b924-4f40-8f75-04f8794f13c2",
        level: state.stats.currentLevel,
        rows: 3,
        columns: 3,
        astronautCount: 3,
        memorizationMs: 3000,
        memorizeUntilAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        phase: "recall",
        resumePhase: null,
        remainingMs: 0,
        astronautIndices: [1, 4, 7],
        selectedIndices: [],
        pausedAt: null,
      };
      writeState(state);
      return respond(state.activeAttempt);
    }
    if (url.pathname.endsWith("/submit") && method === "POST") {
      const state = readState();
      const selected = JSON.parse(init.body ?? "{}").selectedIndices ?? [];
      const successful = selected.length === 3 && [1, 4, 7].every((index) => selected.includes(index));
      state.stats.totalAttempts += 1;
      state.stats.successfulAttempts += successful ? 1 : 0;
      state.stats.failedAttempts += successful ? 0 : 1;
      state.stats.currentLevel = successful ? 2 : 1;
      state.stats.memoryXp = successful ? 5 : 0;
      state.stats.levelsCompleted = successful ? 1 : 0;
      state.stats.highestLevel = successful ? 1 : 0;
      state.stats.bestRun = successful ? 1 : 0;
      state.stats.accuracy = successful ? 100 : 0;
      state.stats.lastPlayedAt = new Date().toISOString();
      state.activeAttempt = null;
      writeState(state);
      return respond({
        attemptId: "f5a8a6fa-b924-4f40-8f75-04f8794f13c2",
        successful,
        level: 1,
        correctTileIndices: [1, 4, 7],
        selectedIndices: selected,
        correctSelections: successful ? 3 : selected.filter((index) => [1, 4, 7].includes(index)).length,
        xpAwarded: successful ? 5 : 0,
        officialXpAwarded: successful ? 5 : 0,
        runCompleted: false,
        runXpAwarded: null,
        globalRankBefore: null,
        globalRankAfter: successful ? 1 : null,
        stats: state.stats,
      });
    }
    if (url.pathname === "/api/memory-game/leaderboard" && method === "GET") {
      const scope = url.searchParams.get("scope") ?? "friends";
      const friendEntry = {
        rank: 1, name: "Game Friend", username: "game_friend", avatarUrl: null,
        memoryXp: 10, levelsCompleted: 2, highestLevel: 2, gamesPlayed: 1,
        bestRun: 2, accuracy: 100, isCurrentUser: false,
      };
      const playerEntry = {
        rank: scope === "friends" ? 2 : 4,
        name: player.name, username: player.username, avatarUrl: null,
        memoryXp: 5, levelsCompleted: 1, highestLevel: 1, gamesPlayed: 1,
        bestRun: 1, accuracy: 100, isCurrentUser: true,
      };
      const globalEntries = [
        { ...friendEntry, rank: 1 },
        { ...friendEntry, rank: 2, name: "Global Player", username: "global_player", memoryXp: 20, highestLevel: 3 },
      ];
      return respond({
        scope,
        page: Number(url.searchParams.get("page") ?? 1),
        pageSize: Number(url.searchParams.get("pageSize") ?? 20),
        totalPlayers: scope === "friends" ? 2 : 4,
        hasMore: false,
        hasFriends: true,
        entries: scope === "friends" ? [friendEntry, playerEntry] : globalEntries,
        currentUserRank: playerEntry.rank,
        currentUserEntry: playerEntry,
      });
    }
    if (url.pathname.endsWith("/analytics/events") && method === "POST") {
      return respond({ accepted: true }, 202);
    }
    window.__memoryGameUnexpectedApi.push(method + " " + url.pathname + url.search);
    localStorage.setItem("__memoryGameUnexpectedApi", JSON.stringify(window.__memoryGameUnexpectedApi));
    return respond({ message: "Unexpected API request in Memory Game mobile flow." }, 404);
  };
})();`;

class DevToolsClient {
  #socket;
  #nextId = 0;
  #pending = new Map();

  static async connect(url) {
    const client = new DevToolsClient(url);
    await new Promise((resolve, reject) => {
      client.#socket.addEventListener("open", resolve, { once: true });
      client.#socket.addEventListener("error", reject, { once: true });
    });
    client.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = client.#pending.get(message.id);
      if (!pending) return;
      client.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    return client;
  }

  constructor(url) {
    this.#socket = new WebSocket(url);
  }

  send(method, params = {}) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed.");
    }
    return response.result?.value;
  }

  close() {
    this.#socket.close();
  }
}

async function launchBrowser(t) {
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-memory-game-test-"));
  const chromium = spawn(chromiumPath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--ignore-certificate-errors",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], detached: true });
  let chromiumErrors = "";
  chromium.stderr.setEncoding("utf8");
  chromium.stderr.on("data", (chunk) => { chromiumErrors += chunk; });
  let client;

  t.after(async () => {
    client?.close();
    const waitForExit = () => chromium.exitCode !== null || chromium.signalCode !== null
      ? Promise.resolve()
      : new Promise((resolve) => chromium.once("exit", resolve));
    try {
      process.kill(-chromium.pid, "SIGTERM");
    } catch {
      chromium.kill("SIGTERM");
    }
    await Promise.race([waitForExit(), delay(3000)]);
    if (chromium.exitCode === null && chromium.signalCode === null) {
      try {
        process.kill(-chromium.pid, "SIGKILL");
      } catch {
        chromium.kill("SIGKILL");
      }
      await waitForExit();
    }
    await rm(profileDir, { recursive: true, force: true });
  });

  try {
    const activePortFile = join(profileDir, "DevToolsActivePort");
    const deadline = Date.now() + 15_000;
    let activePortContents;
    while (Date.now() < deadline) {
      if (chromium.exitCode !== null) throw new Error("Chromium exited before starting DevTools.");
      try {
        activePortContents = await readFile(activePortFile, "utf8");
        break;
      } catch {
        await delay(50);
      }
    }
    assert.ok(activePortContents, `Timed out waiting for Chromium DevTools.\n${chromiumErrors}`);
    const [port] = activePortContents.trim().split("\n");
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    assert.equal(targetResponse.status, 200, "Chromium should open a DevTools page target.");
    const target = await targetResponse.json();
    client = await DevToolsClient.connect(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: mockApiSource });
    return client;
  } catch (error) {
    throw new Error(`${error.message}\n${chromiumErrors}`);
  }
}

async function waitForValue(client, expression, predicate, description, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression);
    if (predicate(lastValue)) return lastValue;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${JSON.stringify(lastValue)}`);
}

async function tapTestId(client, testId) {
  const selector = JSON.stringify(`[data-testid="${testId}"]`);
  const tapped = await client.evaluate(`(() => {
    const element = document.querySelector(${selector});
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    if (element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    element.click();
    return true;
  })()`);
  assert.equal(tapped, true, `Expected enabled control "${testId}" to be present.`);
}

test("signed-in Memory Game saves progress and restores it when reopened", async (t) => {
  const appUrl = getAppPreviewUrl("The signed-in Memory Game mobile flow");
  const client = await launchBrowser(t);
  await client.send("Page.navigate", { url: `${appUrl}/?screen=memory-game` });

  await waitForValue(
    client,
    `(() => ({
      ready: Boolean(document.querySelector('[data-testid="memory-game-start"]')),
      location: location.href,
      text: document.body?.innerText?.slice(0, 1200) ?? "",
      token: localStorage.getItem("@experiences/auth-token"),
      traffic: window.__memoryGameApiTraffic ?? [],
      unexpected: window.__memoryGameUnexpectedApi ?? [],
    }))()`,
    (state) => state.ready,
    "the authenticated Memory Game start control",
  );
  await tapTestId(client, "memory-game-start");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="memory-game-tile-1"]'))`,
    Boolean,
    "the first recall grid",
  );
  for (const index of [1, 4, 7]) await tapTestId(client, `memory-game-tile-${index}`);
  await tapTestId(client, "memory-game-submit");
  const resultText = await waitForValue(
    client,
    `document.querySelector('[data-testid="memory-game-result"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? ""`,
    (text) => text.includes("Level cleared!") && text.includes("+5 game-score points"),
    "the successful level result and score award",
  );
  assert.ok(resultText.includes("+5 official XP"), "the result should show the official XP awarded to this profile");

  await tapTestId(client, "memory-game-result-leaderboard");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="memory-leaderboard-entry-2"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? ""`,
    (text) => text.includes("Memory QA") && text.includes("You"),
    "the current player's friends ranking",
  );
  assert.ok(
    (await client.evaluate(`document.querySelector('[data-testid="memory-leaderboard-entry-1"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? ""`))
      .includes("Game Friend"),
    "the friends ranking should show the signed-in player's accepted friend",
  );
  await tapTestId(client, "memory-leaderboard-tab-global");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="memory-leaderboard-entry-2"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? ""`,
    (text) => text.includes("Global Player"),
    "the global leaderboard response",
  );
  await waitForValue(
    client,
    `document.querySelector('[data-testid="memory-leaderboard-entry-4"]')?.innerText?.replace(/\\s+/g, " ").trim() ?? ""`,
    (text) => text.includes("Memory QA") && text.includes("You"),
    "the current player's rank outside the visible global page",
  );

  await client.send("Page.navigate", { url: `${appUrl}/?screen=memory-game` });
  const restored = await waitForValue(
    client,
    `(() => ({
      text: document.body?.innerText?.replace(/\\s+/g, " ").trim() ?? "",
      body: document.body?.innerText?.slice(0, 1200) ?? "",
      location: location.href,
      token: localStorage.getItem("@experiences/auth-token"),
      traffic: window.__memoryGameApiTraffic ?? [],
      unexpected: window.__memoryGameUnexpectedApi ?? [],
    }))()`,
    (state) => state.text.includes("Level 2 of 100") && state.text.includes("Game score") && state.text.includes("5"),
    "saved level and score after reopening the signed-in game",
  );
  assert.ok(restored.text.includes("Levels cleared") && restored.text.includes("1"));
  const audit = await client.evaluate(`({
    token: localStorage.getItem("@experiences/auth-token"),
    fixture: JSON.parse(localStorage.getItem("__memoryGameFlowFixture") ?? "null"),
    traffic: window.__memoryGameApiTraffic,
    unexpected: window.__memoryGameUnexpectedApi,
  })`);
  assert.equal(audit.token, sessionToken, "the same signed-in test profile should be restored on reopening");
  assert.equal(audit.fixture.stats.currentLevel, 2);
  assert.equal(audit.fixture.stats.memoryXp, 5);
  assert.equal(audit.fixture.stats.totalAttempts, 1);
  assert.deepEqual(audit.unexpected, [], "the flow should not depend on unconfigured API responses");
  const memoryRequests = audit.traffic.filter((request) => request.path.startsWith("/api/memory-game/"));
  assert.ok(memoryRequests.some((request) => request.path === "/api/memory-game/stats" && request.method === "GET"));
  assert.ok(memoryRequests.some((request) => request.path === "/api/memory-game/attempts" && request.method === "POST"));
  assert.ok(memoryRequests.some((request) => request.path.endsWith("/submit") && request.method === "POST"));
  assert.ok(memoryRequests.some((request) => request.path.includes("scope=friends")));
  assert.ok(memoryRequests.some((request) => request.path.includes("scope=global")));
  assert.ok(memoryRequests.every((request) => request.authorization === `Bearer ${sessionToken}`),
    "all game and leaderboard requests must use the signed-in profile token");
});
