import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const viewport = { width: 360, height: 740 };
const sessionToken = "email_home-prompt-test";
const chromiumPath = process.env.CHROMIUM_PATH
  ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : "chromium");

class DevToolsClient {
  #socket;
  #nextId = 0;
  #pending = new Map();
  #listeners = new Map();

  static async connect(url) {
    const client = new DevToolsClient(url);
    await new Promise((resolve, reject) => {
      client.#socket.addEventListener("open", resolve, { once: true });
      client.#socket.addEventListener("error", reject, { once: true });
    });
    client.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = client.#pending.get(message.id);
        if (!pending) return;
        client.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of client.#listeners.get(message.method) ?? []) listener(message);
    });
    return client;
  }

  constructor(url) {
    this.#socket = new WebSocket(url);
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? [];
    listeners.push(listener);
    this.#listeners.set(method, listeners);
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
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-home-prompt-test-"));
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
    await Promise.race([waitForExit(), delay(3_000)]);
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
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: "PUT",
    });
    assert.equal(targetResponse.status, 200, "Chromium should open a DevTools page target.");
    const target = await targetResponse.json();
    client = await DevToolsClient.connect(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
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
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${selector});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      visible: rect.width > 0 && rect.height > 0
        && rect.top >= 0
        && rect.bottom <= (window.visualViewport?.height ?? window.innerHeight),
      disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
    };
  })()`);
  assert.ok(point, `Expected control "${testId}" to be present.`);
  assert.ok(point.visible, `Expected control "${testId}" to be visible.`);
  assert.ok(!point.disabled, `Expected control "${testId}" to be enabled.`);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}

function apiResponseHeaders(request, domain) {
  return [
    { name: "Content-Type", value: "application/json" },
    {
      name: "Access-Control-Allow-Origin",
      value: request.headers.Origin ?? request.headers.origin ?? `https://${domain}`,
    },
  ];
}

const user = {
  id: 690,
  createdAt: "2026-01-01T00:00:00.000Z",
  telegramId: null,
  email: "home.qa@example.test",
  name: "Home QA",
  username: "home_qa",
  avatarUrl: null,
  bio: "A local Home prompt test profile.",
  city: "London",
  country: "UK",
  socialLinks: {},
  interests: ["environmental"],
  participationType: null,
  userType: "participant",
  organisation: null,
  xp: 320,
  level: "Explorer",
  completedCount: 2,
  hostedCount: 0,
  rewardsPence: 0,
};

function makeParticipation(id) {
  const organisation = {
    id: 691,
    name: "Home QA Community",
    description: "A local test organisation.",
    city: "London",
    country: "UK",
    categories: ["environmental"],
    verified: true,
  };
  const experience = {
    id: 6900 + id,
    organisation,
    title: `Community Garden ${id}`,
    description: "A local test experience.",
    category: "environmental",
    date: "2026-12-12",
    startTime: "10:00",
    endTime: "12:00",
    location: "Community Garden",
    city: "London",
    capacity: 8,
    participantCount: 1,
    availablePlaces: 7,
    xpReward: 100,
    monetaryRewardPence: null,
    status: "published",
    waitlistCount: 0,
  };
  return {
    id,
    experience,
    participant: user,
    status: "joined",
    joinedAt: "2026-09-30T10:00:00.000Z",
    attendedAt: null,
    submittedAt: null,
    verifiedAt: null,
    rewardStatus: "pending",
  };
}

test("the signed-in Home prompt fits, stays accessible, and opens My journey", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the Home prompt preview test.");

  const client = await launchBrowser(t);
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  let interceptionError;
  let upcomingParticipations = [];

  client.on("Fetch.requestPaused", ({ params }) => {
    void (async () => {
      try {
        const url = new URL(params.request.url);
        if (!url.pathname.startsWith("/api/")) {
          await client.send("Fetch.continueRequest", { requestId: params.requestId });
          return;
        }

        const method = params.request.method;
        apiTraffic.push(`${method} ${url.pathname}${url.search}`);
        if (method === "OPTIONS") {
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: [
              ...apiResponseHeaders(params.request, domain),
              { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
              {
                name: "Access-Control-Allow-Headers",
                value: params.request.headers["Access-Control-Request-Headers"]
                  ?? params.request.headers["access-control-request-headers"]
                  ?? "authorization,content-type",
              },
            ],
            body: "",
          });
          return;
        }

        let status = 200;
        let response;
        if (url.pathname === "/api/me" && method === "GET") {
          const authorization = params.request.headers.Authorization
            ?? params.request.headers.authorization;
          if (authorization !== `Bearer ${sessionToken}`) {
            status = 401;
            response = { message: "The test session was not restored." };
          } else {
            response = user;
          }
        } else if (url.pathname === "/api/participations" && method === "GET") {
          response = url.searchParams.get("status") === "upcoming"
            ? upcomingParticipations
            : [];
        } else if (url.pathname === "/api/experiences" && method === "GET") {
          response = [];
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}${url.search}`);
          status = 404;
          response = { message: "Unexpected API request in Home prompt test." };
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, domain),
          body: Buffer.from(JSON.stringify(response)).toString("base64"),
        });
      } catch (error) {
        interceptionError ??= error;
        await client.send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "Failed",
        }).catch(() => {});
      }
    })();
  });

  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('@experiences/auth-token', '${sessionToken}');`,
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 1,
    mobile: true,
  });

  const screenshotDir = process.env.HOME_PROMPT_SCREENSHOT_DIR;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

  async function openHomeForCount(count, stateName) {
    upcomingParticipations = Array.from({ length: count }, (_, index) => makeParticipation(index + 1));
    await client.send("Page.navigate", { url: `https://${domain}/?screen=home` });
    const headline = count === 0
      ? "Ready for your first experience?"
      : `${count} experience${count === 1 ? "" : "s"} coming up`;
    await waitForValue(
      client,
      `document.querySelector('[data-testid="dashboard-first-experience"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text.includes(headline),
      `the ${stateName} Home prompt after authenticated data has loaded`,
    );

    const cardState = await client.evaluate(`(() => {
      const card = document.querySelector('[data-testid="dashboard-first-experience"]');
      const passportLabel = [...document.querySelectorAll('*')]
        .find((element) => element.children.length === 0 && element.textContent.trim() === 'EXPERIENCE PASSPORT');
      const passport = passportLabel?.closest('[role="button"]');
      if (!card || !passport) return null;
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      };
      const exactText = (value) => [...card.querySelectorAll('*')]
        .find((element) => element.children.length === 0 && element.textContent.trim() === value);
      const titleText = ${JSON.stringify(headline)};
      const bodyText = ${JSON.stringify(count === 0
        ? "Find an experience you’ll look forward to."
        : "Your next plans are ready when you are.")};
      const actionText = ${JSON.stringify(count === 0 ? "Explore experiences" : "View upcoming experiences")};
      const title = exactText(titleText);
      const body = exactText(bodyText);
      const action = exactText(actionText);
      return {
        role: card.getAttribute('role'),
        accessibilityLabel: card.getAttribute('aria-label'),
        card: rect(card),
        passport: rect(passport),
        title: title ? rect(title) : null,
        body: body ? rect(body) : null,
        action: action ? rect(action) : null,
        viewport: {
          width: window.innerWidth,
          height: window.visualViewport?.height ?? window.innerHeight,
        },
      };
    })()`);

    assert.ok(cardState, "The Home prompt card should be present.");
    assert.deepEqual(cardState.viewport, viewport, "The page should use the narrow phone viewport.");
    assert.equal(cardState.role, "button", "The card should be exposed as a button.");
    assert.equal(
      cardState.accessibilityLabel,
      count === 0 ? "Explore your first experience" : "Open your upcoming experiences",
      "The card should have a descriptive state-specific accessibility label.",
    );
    for (const [label, bounds] of [
      ["card", cardState.card],
      ["headline", cardState.title],
      ["supporting text", cardState.body],
      ["action", cardState.action],
    ]) {
      assert.ok(bounds, `The ${label} should render as visible text.`);
      assert.ok(bounds.width > 0 && bounds.height > 0, `The ${label} should not be clipped away.`);
      assert.ok(bounds.left >= cardState.card.left - 1 && bounds.right <= cardState.card.right + 1,
        `The ${label} should fit within the card.`);
      assert.ok(bounds.top >= cardState.card.top - 1 && bounds.bottom <= cardState.card.bottom + 1,
        `The ${label} should fit vertically within the card.`);
      assert.ok(bounds.scrollWidth <= bounds.clientWidth + 2, `The ${label} should not clip horizontally.`);
      assert.ok(bounds.scrollHeight <= bounds.clientHeight + 2, `The ${label} should not clip vertically.`);
    }
    assert.ok(cardState.card.top >= 0 && cardState.card.bottom <= viewport.height,
      "The entire prompt card should fit within the phone viewport.");
    assert.ok(cardState.card.bottom <= cardState.passport.top + 1,
      "The passport card should not cover the Home prompt action.");

    if (screenshotDir) {
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      const screenshotPath = join(screenshotDir, `${stateName}.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      console.log(`Home prompt screenshot: ${screenshotPath}`);
    }

    await tapTestId(client, "dashboard-first-experience");
    await waitForValue(
      client,
      `(() => ({
        search: location.search,
        text: document.body.innerText.slice(0, 1000),
        screen: document.querySelector('[data-testid="dashboard-first-experience"]') ? 'home' : 'journey',
      }))()`,
      (state) => state.screen === "journey" && state.text.includes("My journey"),
      `the expected My journey destination from the ${stateName} card`,
    );
    if (count === 0) {
      assert.equal(
        await client.evaluate(`document.body.innerText.includes('Nothing booked yet')`),
        true,
        "The empty prompt should open the empty upcoming journey state.",
      );
    } else {
      assert.equal(
        await client.evaluate(`document.body.innerText.includes('Community Garden 1')`),
        true,
        "The upcoming prompt should open the matching experience list.",
      );
    }
  }

  await openHomeForCount(0, "empty");
  await openHomeForCount(1, "singular");
  await openHomeForCount(2, "plural");

  assert.ifError(interceptionError);
  assert.ok(
    apiTraffic.some((request) => request === "GET /api/me"),
    "The normal authenticated session restore should load the signed-in user.",
  );
  assert.ok(
    apiTraffic.some((request) => request.startsWith("GET /api/participations?status=upcoming")),
    "The Home prompt should use the signed-in user's upcoming participation data.",
  );
  assert.deepEqual(unexpectedApiRequests, [], "The Home flow should only request the fixture-backed APIs.");
});