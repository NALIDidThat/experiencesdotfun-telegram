import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { getAppPreviewUrl } from "./preview-test-config.mjs";

const viewport = { width: 360, height: 740 };
const sessionToken = "email_explore-globe-test";
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
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-explore-globe-test-"));
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
  let lastEvaluationError;
  while (Date.now() < deadline) {
    try {
      lastValue = await client.evaluate(expression);
      lastEvaluationError = undefined;
    } catch (error) {
      lastEvaluationError = error;
      await delay(100);
      continue;
    }
    if (predicate(lastValue)) return lastValue;
    await delay(100);
  }
  const lastResult = lastValue === undefined ? "unavailable" : JSON.stringify(lastValue);
  const evaluationError = lastEvaluationError ? ` Last evaluation error: ${lastEvaluationError.message}` : "";
  throw new Error(`Timed out waiting for ${description}. Last value: ${lastResult}.${evaluationError}`);
}

async function waitForStableValue(client, expression, predicate, description, timeoutMs = 20_000, stableReads = 3) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  let consecutiveMatches = 0;
  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression);
    consecutiveMatches = predicate(lastValue) ? consecutiveMatches + 1 : 0;
    if (consecutiveMatches >= stableReads) return lastValue;
    await delay(100);
  }
  throw new Error(`Timed out waiting for stable ${description}. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForSheetPosition(client, expanded, description) {
  return waitForStableValue(
    client,
    `(() => {
      const screenHeight = document.querySelector('[data-testid="explore-screen-layout"]')?.getBoundingClientRect().height ?? 0;
      const sheetHeight = document.querySelector('[data-testid="explore-experience-sheet"]')?.getBoundingClientRect().height ?? 0;
      const collapsedHeight = Math.min(208, Math.max(176, screenHeight * 0.34));
      const targetHeight = ${expanded}
        ? Math.max(collapsedHeight, Math.min(screenHeight * 0.72, screenHeight - 212))
        : collapsedHeight;
      return { sheetHeight, targetHeight };
    })()`,
    ({ sheetHeight, targetHeight }) => Math.abs(sheetHeight - targetHeight) <= 1,
    description,
  );
}

async function tapElement(client, selector, description, offsetX = 0, offsetY = 0, scrollTargetIntoView = true) {
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const originalRect = element.getBoundingClientRect();
    const target = originalRect.width > 0 && originalRect.height > 0
      ? element
      : element.querySelector("circle") ?? element;
    let rect = target.getBoundingClientRect();
    const svg = target.closest("svg");
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;
    if (rect.width === 0 && rect.height === 0 && target.tagName.toLowerCase() === "circle" && svg) {
      const svgRect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      const scale = Math.min(svgRect.width / viewBox.width, svgRect.height / viewBox.height);
      const offsetX = (svgRect.width - viewBox.width * scale) / 2;
      const offsetY = (svgRect.height - viewBox.height * scale) / 2;
      x = svgRect.left + offsetX + (Number(target.getAttribute("cx")) - viewBox.x) * scale;
      y = svgRect.top + offsetY + (Number(target.getAttribute("cy")) - viewBox.y) * scale;
      const radius = Number(target.getAttribute("r")) * scale;
      rect = { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius, width: radius * 2, height: radius * 2 };
    } else {
      if (${scrollTargetIntoView}) target.scrollIntoView({ block: "center", inline: "nearest" });
      rect = target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    x += ${offsetX};
    y += ${offsetY};
    const hit = document.elementFromPoint(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      tag: target.tagName,
      hitTag: hit?.tagName ?? null,
      hitLabel: hit?.getAttribute("aria-label") ?? null,
      hitTestId: hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? null,
      hitHtml: hit?.outerHTML?.slice(0, 180) ?? null,
      visible: rect.width > 0 && rect.height > 0
        && rect.top >= 0
        && rect.bottom <= (window.visualViewport?.height ?? window.innerHeight),
      disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
    };
  })()`);
  assert.ok(point, `Expected ${description} to be present.`);
  assert.ok(point.visible, `Expected ${description} to be visible. Geometry: ${JSON.stringify(point)}`);
  assert.ok(!point.disabled, `Expected ${description} to be enabled.`);
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
  await delay(50);
  return point;
}

async function tapTestId(client, testId) {
  const overlayControl = testId.startsWith("explore-sheet-")
    || testId.startsWith("explore-globe-")
    || testId.startsWith("explore-category-")
    || testId.startsWith("explore-mode-")
    || ["explore-search-input", "explore-clear-city", "explore-clear-search"].includes(testId);
  const point = await tapElement(client, `[data-testid="${testId}"]`, `control "${testId}"`, 0, 0, !overlayControl);
  assert.equal(
    point.hitTestId,
    testId,
    `Expected the tap on "${testId}" to hit that control. Geometry: ${JSON.stringify(point)}`,
  );
  return point;
}

async function dragGlobeWithSyntheticTouch(client, deltaX, deltaY) {
  const result = await client.evaluate(`(() => {
    const stage = document.querySelector("svg")?.parentElement;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const startX = rect.left + rect.width * 0.78;
    const startY = rect.top + rect.height * 0.5;
    const createTouch = (x, y) => new Touch({
      identifier: 1,
      target: stage,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pageX: x + window.scrollX,
      pageY: y + window.scrollY,
    });
    const start = createTouch(startX, startY);
    stage.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true, cancelable: true, touches: [start], targetTouches: [start], changedTouches: [start],
    }));
    const moved = createTouch(startX + ${deltaX}, startY + ${deltaY});
    stage.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true, cancelable: true, touches: [moved], targetTouches: [moved], changedTouches: [moved],
    }));
    stage.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [moved],
    }));
    return { startX, startY, endX: startX + ${deltaX}, endY: startY + ${deltaY} };
  })()`);
  assert.ok(result, "The globe stage should exist for touch-drag verification.");
  return result;
}

async function dragSheetWithSyntheticTouch(client, deltaY) {
  const result = await client.evaluate(`(() => {
    const handle = document.querySelector('[data-testid="explore-sheet-handle"]');
    if (!handle) return null;
    const rect = handle.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const createTouch = (y) => new Touch({
      identifier: 2,
      target: handle,
      clientX: startX,
      clientY: y,
      screenX: startX,
      screenY: y,
      pageX: startX + window.scrollX,
      pageY: y + window.scrollY,
    });
    const start = createTouch(startY);
    handle.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true, cancelable: true, touches: [start], targetTouches: [start], changedTouches: [start],
    }));
    const moved = createTouch(startY + ${deltaY});
    handle.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true, cancelable: true, touches: [moved], targetTouches: [moved], changedTouches: [moved],
    }));
    handle.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [moved],
    }));
    return { startY, endY: startY + ${deltaY} };
  })()`);
  assert.ok(result, "The experience sheet handle should exist for swipe verification.");
  return result;
}

function apiResponseHeaders(request, origin) {
  return [
    { name: "Content-Type", value: "application/json" },
    {
      name: "Access-Control-Allow-Origin",
      value: request.headers.Origin ?? request.headers.origin ?? origin,
    },
  ];
}

const user = {
  id: 760,
  createdAt: "2026-01-01T00:00:00.000Z",
  telegramId: null,
  email: "explore.qa@example.test",
  name: "Explore QA",
  username: "explore_qa",
  avatarUrl: null,
  bio: "A local Explore globe test profile.",
  city: "London",
  country: "UK",
  socialLinks: {},
  interests: ["environmental"],
  participationType: null,
  userType: "participant",
  organisation: null,
  xp: 120,
  level: "Explorer",
  completedCount: 0,
  hostedCount: 0,
  rewardsPence: 0,
};

function makeExperience(id, title, category, city) {
  return {
    id,
    organisation: {
      id: 800 + id,
      name: `${city} Community`,
      description: "A local test organisation.",
      city,
      country: city === "London" ? "UK" : "Test",
      categories: [category],
      verified: true,
    },
    title,
    description: `A local ${category} experience in ${city}.`,
    category,
    date: "2026-12-12",
    startTime: "10:00",
    endTime: "12:00",
    location: `${city} community space`,
    city,
    verifiedLocation: null,
    capacity: 12,
    participantCount: 2,
    availablePlaces: 10,
    xpReward: 100,
    monetaryRewardPence: null,
    status: "published",
  };
}

const experiences = [
  {
    ...makeExperience(761, "London River Cleanup", "environmental", "London"),
    verifiedLocation: {
      latitude: 51.5,
      longitude: -0.1,
      precision: "venue_area",
      sourceType: "venue_site",
      sourceUrl: "https://venue.example.test/events/river-cleanup",
      verifiedAt: "2026-09-20T10:00:00.000Z",
    },
  },
  makeExperience(762, "London Neighbourhood Meetup", "community", "London"),
  makeExperience(763, "New York Learning Circle", "education", "New York"),
  makeExperience(764, "Toronto Park Planting", "environmental", "Toronto"),
  makeExperience(765, "Springfield Food Sharing", "community", "Springfield"),
];
const friends = [
  { id: 901, name: "Ava Harper", username: "ava", avatarUrl: null, city: "London" },
  { id: 902, name: "Milo Chen", username: "milo", avatarUrl: null, city: "Toronto" },
  { id: 903, name: "Casey Reed", username: "casey", avatarUrl: null, city: "Springfield" },
];

test("Participant experience details keep navigation visible and present concise event information", async (t) => {
  const appUrl = getAppPreviewUrl("The Explore map fallback test");
  const appOrigin = new URL(appUrl).origin;
  const mapsConfigured = Boolean(process.env.Google_Maps_API || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const client = await launchBrowser(t);
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  const browserErrors = [];
  let interceptionError;

  client.on("Runtime.exceptionThrown", ({ params }) => {
    browserErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text ?? "Browser exception");
  });
  client.on("Runtime.consoleAPICalled", ({ params }) => {
    if (params.type === "error") {
      browserErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }
  });
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
              ...apiResponseHeaders(params.request, appOrigin),
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
        } else if (url.pathname === "/api/friends" && method === "GET") {
          response = friends;
        } else if (url.pathname === "/api/explore/activity" && method === "GET") {
          response = {
            windowDays: 30,
            cities: [{ city: "London", verifiedCompletions: 3 }],
          };
        } else if (url.pathname === "/api/experiences/761" && method === "GET") {
          response = {
            ...experiences[0],
            whatToBring: "Wear gloves for the cleanup.",
            whatYouWillDo: "Join the riverbank cleanup with local volunteers.",
            joined: false,
            participation: null,
            milestones: [],
          };
        } else if (url.pathname === "/api/host/experiences/761/milestones" && method === "GET") {
          response = { milestones: [], submissions: [], milestonesEditable: true };
        } else if (url.pathname === "/api/experiences" && method === "GET") {
          const category = url.searchParams.get("category");
          const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
          response = experiences
            .filter((experience) => !category || experience.category === category)
            .filter((experience) => !search || [
              experience.title,
              experience.city,
              experience.description,
              experience.organisation.name,
            ].some((value) => value.toLowerCase().includes(search)));
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}${url.search}`);
          status = 404;
          response = { message: "Unexpected API request in Explore map test." };
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
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
    source: `localStorage.setItem('@experiences/auth-token', '${sessionToken}');
window.__exploreLocationCalls = 0;
Object.defineProperty(navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition() { window.__exploreLocationCalls += 1; },
    watchPosition() { window.__exploreLocationCalls += 1; return 1; },
    clearWatch() {},
  },
});`,
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 1,
    mobile: true,
  });
  if (mapsConfigured) {
    await client.send("Page.navigate", { url: `${appUrl}/?screen=experience&id=761` });
    await waitForValue(
      client,
      `document.body.innerText.includes('Experience details') && document.body.innerText.includes('London River Cleanup')`,
      Boolean,
      "the participant detail page without opening the live map",
    );
  } else {
    await client.send("Page.navigate", { url: `${appUrl}/?screen=explore` });
    try {
    await waitForValue(
      client,
      `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text === "5 experiences",
      "the authenticated Explore experience results",
    );
  } catch (error) {
    const pageDiagnostics = await client.evaluate(`JSON.stringify({
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body?.innerText?.slice(0, 2000) ?? '',
      rootHtml: document.querySelector('#root')?.innerHTML?.slice(0, 1500) ?? '',
    })`).catch((diagnosticError) => diagnosticError.message);
    throw new Error(`${error.message}\nPage diagnostics: ${pageDiagnostics}\nBrowser errors: ${browserErrors.join(" | ") || "none"}\nIntercepted API requests: ${apiTraffic.join(", ") || "none"}`);
  }
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-map-fallback"]') && document.querySelector('[data-testid="explore-map-configuration-notice"]'))`,
    Boolean,
    "the visible fallback while no Maps browser key is configured",
  );
  assert.equal(
    await client.evaluate(`window.__exploreLocationCalls ?? 0`),
    0,
    "Explore must not request device location until the user taps My location.",
  );
  await waitForSheetPosition(client, false, "the collapsed experience sheet before checking the map notice");
  const fallbackNoticeGeometry = await client.evaluate(`(() => {
    const notice = document.querySelector('[data-testid="explore-map-configuration-notice"]')?.getBoundingClientRect();
    const sheet = document.querySelector('[data-testid="explore-experience-sheet"]')?.getBoundingClientRect();
    return { noticeBottom: notice?.bottom ?? 0, sheetTop: sheet?.top ?? 0 };
  })()`);
  assert.ok(
    fallbackNoticeGeometry.noticeBottom < fallbackNoticeGeometry.sheetTop,
    `The map configuration notice should stay above the collapsed sheet. Geometry: ${JSON.stringify(fallbackNoticeGeometry)}`,
  );
  assert.ok(
    await client.evaluate(`[...document.querySelectorAll('*')].some((element) => element.children.length === 0 && element.textContent.trim() === 'Explore')`),
    "Explore screen should be displayed.",
  );
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('EXPERIENCES.FUN')`),
    false,
    "The selected Experiences.fun brand block should be absent from the Explore header.",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-notifications-button"]'))`),
    "The notifications action should remain in the Explore header.",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-profile-button"]'))`),
    "The profile action should remain in the Explore header.",
  );
  const defaultGlobeRadius = await client.evaluate(`document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`);
  assert.ok(defaultGlobeRadius, "The default globe scale should be available before any city is focused.");

  const initialCards = await client.evaluate(
    ` [...document.querySelectorAll('[data-testid^="explore-experience-card-"]')].map((element) => element.getAttribute('data-testid'))`,
  );
  assert.equal(initialCards.length, experiences.length, "All returned experiences should be listed.");
  assert.ok(initialCards.includes("explore-experience-card-765"), "The unmapped city's experience stays in the list.");
  await waitForValue(
    client,
    `document.querySelectorAll('[data-testid^="explore-verified-location-"]').length`,
    (count) => count === 1,
    "the single reviewed and consented location pin",
  );
  assert.ok(
    await client.evaluate(`document.querySelector('[data-testid="explore-verified-location-761"]')?.getAttribute('aria-label')?.includes('Verified venue area location in London') ?? false`),
    "The map should identify the reviewed pin's disclosed precision and city.",
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-mode-social"]'))`,
    Boolean,
    "the Social map layer control",
  );
  assert.ok(
    await client.evaluate(`document.querySelector('[data-testid="explore-mode-social"]')?.getAttribute('aria-label')?.includes('Social') ?? false`),
    "The Social layer control should expose an accessible label.",
  );
  await tapTestId(client, "explore-mode-social");
  await waitForValue(
    client,
    `document.querySelectorAll('[data-testid^="explore-friend-pin-"]').length`,
    (count) => count === 2,
    "the mapped accepted-friend city pins",
  );
  assert.ok(
    await client.evaluate(`document.querySelector('[data-testid="explore-sheet-handle"]')?.innerText?.toLowerCase().includes('approximate profile cities') ?? false`),
    "The friend view should disclose that pins use approximate profile cities.",
  );
  if (process.env.EXPLORE_GLOBE_FRIENDS_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(process.env.EXPLORE_GLOBE_FRIENDS_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-friend-pin-903"]'))`),
    false,
    "Friends in unmapped cities should not be assigned invented coordinates.",
  );
  await tapTestId(client, "explore-mode-explore");
  await waitForValue(
    client,
    `document.querySelectorAll('[data-testid^="explore-friend-pin-"]').length`,
    (count) => count === 0,
    "friend pins to disappear when the view is hidden",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="London: 2 experiences"]'))`),
    "The mapped London marker should show its aggregate count.",
  );
  await tapTestId(client, "explore-mode-activity");
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="London: 4 participants signed up; 3 host-verified completions in the last 30 days"]'))`),
    "Activity should show sign-ups and host-verified completions rather than live check-ins.",
  );
  await tapTestId(client, "explore-mode-impact");
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="London: 200 XP offered"]'))`),
    "Impact should show XP offered rather than earned contribution.",
  );
  await tapTestId(client, "explore-mode-explore");
  assert.ok(
    await client.evaluate(`document.querySelector('[data-testid="explore-sheet-handle"]')?.innerText?.includes('consented, source-verified') ?? false`),
    "The Explore layer should disclose that check pins represent rounded, consented source-verified locations.",
  );
  const fullScreenMetrics = await client.evaluate(`(() => {
    const screen = document.querySelector('[data-testid="explore-screen-layout"]')?.getBoundingClientRect();
    const globe = document.querySelector('[data-testid="explore-globe-map"]')?.getBoundingClientRect();
    return { screenHeight: screen?.height ?? 0, globeHeight: globe?.height ?? 0 };
  })()`);
  assert.ok(fullScreenMetrics.screenHeight > 0, "Explore should fill its available app content area.");
  assert.ok(
    fullScreenMetrics.globeHeight >= fullScreenMetrics.screenHeight * 0.95,
    `The globe should fill the Explore screen behind its overlays. Geometry: ${JSON.stringify(fullScreenMetrics)}`,
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-search-input"]'))`),
    "Search should remain available over the full-screen globe.",
  );
  if (process.env.EXPLORE_GLOBE_INITIAL_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(process.env.EXPLORE_GLOBE_INITIAL_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="Springfield: 1 experiences"]'))`),
    false,
    "An unmapped city should not get a globe marker.",
  );

  await tapElement(client, '[aria-label="London: 2 experiences"]', "the London globe marker", 16);
  const focusedGlobeRadius = await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => Number(radius) > Number(defaultGlobeRadius),
    "the fallback globe camera zoom after focusing a city",
  );
  assert.ok(
    Number(focusedGlobeRadius) > Number(defaultGlobeRadius),
    "Focusing a city should zoom the fallback globe in.",
  );
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "2 experiences",
    "the London-filtered experience list",
    5_000,
  );
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-sheet-toggle"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label === "Collapse experience list",
    "the sheet opening after a city marker is selected",
    5_000,
  );
  assert.ok(
    await client.evaluate(`document.querySelector('[data-testid="explore-sheet-handle"]')?.innerText?.toLowerCase().includes('approximate') ?? false`),
    "The sheet should disclose that city markers show approximate locations.",
  );
  const londonContext = await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-city-context"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text.includes("2 experiences") && text.includes("4 signed up") && text.includes("200 XP offered") && text.includes("3 host-verified completions in the last 30 days"),
    "the London city context summary",
  );
  assert.ok(
    londonContext.includes("1 friend list this profile city"),
    "The city context should count friends by approximate profile city.",
  );
  await waitForSheetPosition(client, true, "the expanded sheet animation to settle");
  if (process.env.EXPLORE_GLOBE_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(process.env.EXPLORE_GLOBE_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  const londonCards = await client.evaluate(
    ` [...document.querySelectorAll('[data-testid^="explore-experience-card-"]')].map((element) => element.getAttribute('data-testid'))`,
  );
  assert.deepEqual(londonCards.sort(), ["explore-experience-card-761", "explore-experience-card-762"]);

  await tapTestId(client, "explore-clear-city");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-clear-city"]'))`,
    (visible) => !visible,
    "the city filter to clear",
    5_000,
  );
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "5 experiences",
    "the restored unfiltered experience list",
  );
  const scrollMetrics = await waitForValue(
    client,
    `(() => {
      const list = document.querySelector('[data-testid="explore-sheet-list"]');
      return { clientHeight: list?.clientHeight ?? 0, scrollHeight: list?.scrollHeight ?? 0 };
    })()`,
    (metrics) => metrics.clientHeight > 0 && metrics.scrollHeight > metrics.clientHeight,
    "a scrollable experience list inside the expanded sheet",
  );
  assert.ok(
    scrollMetrics.scrollHeight > scrollMetrics.clientHeight,
    `The experience list should overflow its own scroll area. Metrics: ${JSON.stringify(scrollMetrics)}`,
  );

  await dragSheetWithSyntheticTouch(client, 84);
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-sheet-toggle"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label === "Expand experience list",
    "the sheet collapsing on a downward swipe",
  );
  await waitForSheetPosition(client, false, "the collapsed sheet animation to settle");
  await dragSheetWithSyntheticTouch(client, -84);
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-sheet-toggle"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label === "Collapse experience list",
    "the sheet expanding on an upward swipe",
  );
  await waitForSheetPosition(client, true, "the sheet reopening to its expanded position");
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-globe-zoom-in"]'))`),
    false,
    "Globe controls should hide while the expanded experience sheet leaves no clear map-control area.",
  );
  await tapTestId(client, "explore-sheet-toggle");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-sheet-toggle"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label === "Expand experience list",
    "the sheet collapsing before globe controls are used",
  );
  await waitForSheetPosition(client, false, "the sheet making room for the globe controls");

  const globeControlsGeometry = await client.evaluate(`(() => {
    const controls = document.querySelector('[data-testid="explore-globe-zoom-in"]')?.parentElement?.getBoundingClientRect();
    const sheet = document.querySelector('[data-testid="explore-experience-sheet"]')?.getBoundingClientRect();
    return {
      controlsTop: controls?.top ?? 0,
      controlsBottom: controls?.bottom ?? 0,
      controlsHeight: controls?.height ?? 0,
      sheetTop: sheet?.top ?? 0,
    };
  })()`);
  assert.ok(
    globeControlsGeometry.controlsTop > 0
      && globeControlsGeometry.controlsHeight <= 60
      && globeControlsGeometry.controlsBottom <= globeControlsGeometry.sheetTop,
    `Globe controls should stay compact and above the collapsed experience sheet. Geometry: ${JSON.stringify(globeControlsGeometry)}`,
  );

  const globeRadius = () => client.evaluate(
    `document.querySelector('svg circle[clip-path]')?.getAttribute('r') ?? document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
  );
  const initialRadius = await globeRadius();
  assert.ok(initialRadius, "The globe should render its zoomable SVG surface.");
  await tapTestId(client, "explore-globe-zoom-in");
  const zoomedRadius = await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => Boolean(radius) && radius !== initialRadius,
    "the globe scale after zooming in",
  );
  assert.notEqual(zoomedRadius, initialRadius, "Zoom in should change the globe scale.");
  await tapTestId(client, "explore-globe-zoom-out");
  let resetTargetRadius = "";
  await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => radius === initialRadius,
    "the initial globe scale after zooming out",
  );
  await tapTestId(client, "explore-globe-zoom-in");
  resetTargetRadius = await client.evaluate(`document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`);
  await tapTestId(client, "explore-globe-reset");
  await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => radius === defaultGlobeRadius,
    `the default globe scale ${defaultGlobeRadius} after zooming from ${resetTargetRadius}`,
  );

  const rotationText = `([...document.querySelectorAll("svg text")]
    .map((element) => element.textContent?.trim() ?? "")
    .find((text) => /^-?\\d+°$/.test(text)) ?? "")`;
  const initialRotation = await client.evaluate(rotationText);
  await dragGlobeWithSyntheticTouch(client, 65, 10);
  await waitForValue(
    client,
    rotationText,
    (rotation) => Boolean(rotation) && rotation !== initialRotation,
    "globe rotation after a horizontal touch drag",
  );

  await tapTestId(client, "explore-category-environmental");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "2 experiences",
    "environmental category results",
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[aria-label="London: 1 experiences"]'))`,
    Boolean,
    "the updated London activity marker",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="London: 1 experiences"]'))`),
    "Environmental filtering should update London’s displayed globe activity.",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="Toronto: 1 experiences"]'))`),
    "Environmental filtering should show Toronto’s matching city activity.",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="New York: 1 experiences"]'))`),
    false,
    "Cities without experiences in the selected category should disappear from the globe.",
  );

  await tapTestId(client, "explore-category-all");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "5 experiences",
    "all categories before searching",
  );
  await tapTestId(client, "explore-search-input");
  await client.send("Input.insertText", { text: "Toronto" });
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "1 experience",
    "the search-filtered experience list",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="explore-experience-card-764"]'))`),
    "Search should keep the matching experience card available.",
  );
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-globe-rotation"]')?.textContent?.trim() ?? ''`,
    (rotation) => rotation === "79°",
    "the globe to focus the searched Toronto city",
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-city-context"]'))`,
    Boolean,
    "the city details for a searched mapped city",
  );
  await waitForSheetPosition(client, true, "the city sheet finishing its search-triggered expansion");
  await tapTestId(client, "explore-sheet-toggle");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-sheet-toggle"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label === "Expand experience list",
    "the city sheet collapsing before globe controls are used",
  );
  await waitForSheetPosition(client, false, "the sheet moving clear of the globe reset control");
  await tapTestId(client, "explore-globe-reset");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-globe-rotation"]')?.textContent?.trim() ?? ''`,
    (rotation) => rotation === "0°",
    "the reset camera position after searching a city",
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-clear-city"]'))`,
    (visible) => !visible,
    "the searched city filter to clear when resetting the globe",
  );
  await tapTestId(client, "explore-clear-search");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "5 experiences",
    "the cleared search results",
  );
  await tapTestId(client, "explore-verified-location-761");
  await waitForValue(
    client,
    `document.body.innerText.includes('Experience details') && document.body.innerText.includes('London River Cleanup')`,
    Boolean,
    "the detail page opened by the verified location pin",
  );
  }
  const detailLayout = await client.evaluate(`(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom };
    };
    return {
      toolbar: rect('[data-testid="experience-detail-toolbar"]'),
      hero: rect('[data-testid="participant-detail-hero"]'),
      facts: rect('[data-testid="participant-detail-facts"]'),
      host: rect('[data-testid="experience-host-details"]'),
      rewards: rect('[data-testid="participant-detail-rewards"]'),
    };
  })()`);
  assert.ok(
    detailLayout.toolbar
      && detailLayout.hero
      && detailLayout.facts
      && detailLayout.host
      && detailLayout.rewards
      && detailLayout.toolbar.bottom <= detailLayout.hero.top
      && detailLayout.hero.top < detailLayout.facts.top
      && detailLayout.facts.top < detailLayout.host.top
      && detailLayout.host.top < detailLayout.rewards.top,
    `Participant details should keep navigation visible and show facts, host, and rewards in order. Layout: ${JSON.stringify(detailLayout)}`,
  );
  const toolbarScrollCheck = await client.evaluate(`(() => {
    const toolbar = document.querySelector('[data-testid="experience-detail-toolbar"]');
    const scroll = document.querySelector('[data-testid="experience-detail-scroll"]');
    if (!toolbar || !scroll) return { scrolled: false, stayedVisible: false };
    const topBefore = toolbar.getBoundingClientRect().top;
    scroll.scrollTop = Math.min(320, scroll.scrollHeight - scroll.clientHeight);
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    return new Promise((resolve) => requestAnimationFrame(() => {
      const topAfter = toolbar.getBoundingClientRect().top;
      const scrolled = scroll.scrollTop > 0;
      scroll.scrollTop = 0;
      resolve({ scrolled, stayedVisible: Math.abs(topAfter - topBefore) < 1 });
    }));
  })()`);
  assert.equal(toolbarScrollCheck.scrolled, true, "Experience details should have a scrollable content area.");
  assert.equal(toolbarScrollCheck.stayedVisible, true, "The back and edit toolbar should remain visible while details scroll.");
  assert.equal(
    await client.evaluate(`document.querySelectorAll('[data-testid="participant-detail-rewards"]')?.length ?? 0`),
    1,
    "Reward details should appear once instead of being repeated in a second summary grid.",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="experience-edit-details"]'))`),
    false,
    "Participants should not see the organisation edit control.",
  );
  await tapTestId(client, "experience-section-toggle-timeline");
  await waitForValue(
    client,
    `document.body.innerText.includes('Complete this experience')`,
    Boolean,
    "the expanded completion timeline",
  );
  await tapTestId(client, "experience-section-toggle-timeline");
  assert.equal(
    await client.evaluate(`document.querySelector('[data-testid="experience-section-toggle-timeline"]')?.getAttribute('aria-expanded') ?? ''`),
    "false",
    "The completion timeline should collapse again.",
  );
  await tapTestId(client, "experience-section-toggle-activity");
  await waitForValue(
    client,
    `document.body.innerText.includes('Join the riverbank cleanup with local volunteers.') && document.body.innerText.includes('Wear gloves for the cleanup.')`,
    Boolean,
    "the expanded activity and what-to-bring details",
  );
  await tapTestId(client, "experience-section-toggle-host");
  await waitForValue(
    client,
    `document.body.innerText.includes('A local test organisation.')`,
    Boolean,
    "the expanded host description",
  );

  if (!mapsConfigured) {
    await waitForValue(client, "document.readyState", (state) => state === "complete", "the Explore page load");
    user.userType = "organisation";
    user.organisation = { ...experiences[0].organisation, id: experiences[0].organisation.id + 1 };
    await client.send("Page.reload");
    await waitForValue(
      client,
      `document.body.innerText.includes('Experience details') && document.body.innerText.includes('London River Cleanup')`,
      Boolean,
      "the experience page for an organisation that does not own it",
    );
    assert.equal(
      await client.evaluate(`Boolean(document.querySelector('[data-testid="experience-edit-details"]'))`),
      false,
      "An organisation that does not own the experience should not see its edit control.",
    );
    user.organisation = experiences[0].organisation;
    await client.send("Page.reload");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="experience-edit-details"]'))`,
      Boolean,
      "the edit control for the owning organisation",
    );
    await tapTestId(client, "experience-edit-details");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="create-review-heading"]')) && document.body.innerText.includes('London River Cleanup')`,
      Boolean,
      "the existing edit form opened from experience details",
    );

    assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/friends")), "Accepted friends should be fetched for city-level map pins.");
    assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/experiences")), "Experiences should be fetched.");
    assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/explore/activity")), "Host-verified city activity should be fetched.");
    assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/host/experiences/761/milestones")), "The existing host edit form should load this experience's editable milestones.");
  }
  user.userType = "participant";
  user.organisation = null;
  experiences[0].status = "cancelled";
  await client.send("Page.navigate", { url: `${appUrl}/?screen=experience&id=761&cancelled=1` });
  await waitForValue(
    client,
    `document.body.innerText.includes('This experience is cancelled. New sign-ups are closed.')`,
    Boolean,
    "the cancelled participant detail notice",
  );
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="experience-cancelled-notice"]'))`),
    "A cancelled experience should retain its status notice in the participant detail layout.",
  );
  assert.ok(
    await client.evaluate(`(() => {
      const rewards = document.querySelector('[data-testid="participant-detail-rewards"]')?.innerText ?? '';
      return rewards.includes('Registration closed') && !rewards.includes('Available to join');
    })()`),
    "A cancelled experience should not imply that its remaining places are available to join.",
  );
  assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/me")), "The mock-auth session should load.");
  assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/experiences/761")), "The backed experience detail should load.");
  assert.equal(interceptionError, undefined, "API request interception should complete without errors.");
  assert.deepEqual(unexpectedApiRequests, [], "The Explore screen should make no unexpected API requests.");
});

test("Google Maps and nearby Places work with the configured browser key", {
  skip: process.env.RUN_LIVE_GOOGLE_MAPS_TEST !== "1"
    || !(process.env.Google_Maps_API || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)
    ? "Set RUN_LIVE_GOOGLE_MAPS_TEST=1 to make live Google Maps and Places requests."
    : false,
}, async (t) => {
  const appUrl = getAppPreviewUrl("The live Google Maps test");
  const appOrigin = new URL(appUrl).origin;

  const client = await launchBrowser(t);
  const browserErrors = [];
  const placesResponses = [];
  let mapsApiRequested = false;
  let placesApiRequested = false;
  let placesApiRequestCount = 0;
  let interceptionError;
  client.on("Runtime.exceptionThrown", ({ params }) => {
    browserErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text ?? "Browser exception");
  });
  client.on("Runtime.consoleAPICalled", ({ params }) => {
    if (params.type === "error") {
      browserErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }
  });
  client.on("Network.responseReceived", ({ params }) => {
    try {
      const url = new URL(params.response.url);
      if (url.hostname === "places.googleapis.com") {
        placesResponses.push({ status: params.response.status, path: url.pathname });
      }
    } catch {
      // Ignore non-URL browser events.
    }
  });
  client.on("Fetch.requestPaused", ({ params }) => {
    void (async () => {
      try {
        const url = new URL(params.request.url);
        if (url.hostname === "maps.googleapis.com") mapsApiRequested = true;
        if (url.hostname === "places.googleapis.com") {
          placesApiRequested = true;
          placesApiRequestCount += 1;
        }
        if (!url.pathname.startsWith("/api/")) {
          await client.send("Fetch.continueRequest", { requestId: params.requestId });
          return;
        }
        if (params.request.method === "OPTIONS") {
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: [
              ...apiResponseHeaders(params.request, appOrigin),
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

        const path = url.pathname;
        const authorization = params.request.headers.Authorization ?? params.request.headers.authorization;
        let status = 200;
        let response;
        if (path === "/api/me" && params.request.method === "GET") {
          if (authorization !== `Bearer ${sessionToken}`) {
            status = 401;
            response = { message: "The test session was not restored." };
          } else {
            response = user;
          }
        } else if (path === "/api/friends" && params.request.method === "GET") {
          response = friends;
        } else if (path === "/api/explore/activity" && params.request.method === "GET") {
          response = { windowDays: 30, cities: [{ city: "London", verifiedCompletions: 3 }] };
        } else if (path === "/api/experiences" && params.request.method === "GET") {
          response = experiences;
        } else if (path.endsWith("/analytics/events") && params.request.method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          status = 404;
          response = { message: "Unexpected API request in live Google Maps test." };
        }
        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
          body: Buffer.from(JSON.stringify(response)).toString("base64"),
        });
      } catch (error) {
        interceptionError ??= error;
        await client.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }).catch(() => {});
      }
    })();
  });

  await client.send("Network.enable");
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('@experiences/auth-token', '${sessionToken}');`,
  });
  await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: true });
  await client.send("Page.navigate", { url: `${appUrl}/?screen=explore` });

  try {
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="explore-map"]') && document.querySelector('#explore-google-map .gm-style'))`,
      Boolean,
      "the rendered 2D Google road map",
      45_000,
    );
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="explore-map-tools-toggle"]'))`,
      Boolean,
      "the compact map tools control",
      45_000,
    );
  } catch (error) {
    const diagnostics = await client.evaluate(`JSON.stringify({
      title: document.title,
      map: Boolean(document.querySelector('[data-testid="explore-map"]')),
      mapCanvas: Boolean(document.querySelector('.gm-style')),
      fallback: document.querySelector('[data-testid="explore-map-error"]')?.innerText
        ?? document.querySelector('[data-testid="explore-map-configuration-notice"]')?.innerText
        ?? null,
      nearby: [...document.querySelectorAll('[data-testid^="explore-map-nearby-"]')].map((item) => item.innerText),
    })`).catch((diagnosticError) => diagnosticError.message);
    throw new Error(`${error.message}\nMap diagnostics: ${diagnostics}\nBrowser console error count: ${browserErrors.length}`);
  }

  assert.equal(mapsApiRequested, true, "The browser should request the Maps JavaScript API.");
  assert.equal(
    await client.evaluate(`document.querySelector('[data-testid="explore-map-tools-toggle"]')?.getAttribute('aria-expanded') ?? ''`),
    "false",
    "The nearby map controls should stay collapsed until requested.",
  );
  await tapTestId(client, "explore-map-tools-toggle");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-nearby-category-list"]'))`,
    Boolean,
    "the nearby category controls after opening map tools",
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-map-nearby-ready"]'))`,
    Boolean,
    "successful nearby Places results",
    45_000,
  );
  assert.equal(placesApiRequested, true, "The browser should request Places API (New).");
  const placeListState = await client.evaluate(`(() => {
    const list = document.querySelector('[data-testid="explore-nearby-place-list"]');
    const rows = [...document.querySelectorAll('[data-testid^="explore-nearby-place-"]')]
      .filter((element) => /^explore-nearby-place-\\d+$/.test(element.getAttribute('data-testid') ?? ''));
    return { listVisible: Boolean(list), rowCount: rows.length, firstPlace: rows[0]?.innerText ?? '' };
  })()`);
  assert.equal(placeListState.listVisible, true, "The nearby panel should display the Google places list.");
  assert.ok(placeListState.rowCount > 0, "Every returned nearby place should have a selectable list row.");
  assert.ok(placeListState.firstPlace.trim(), "The first Google place row should include visible business information.");
  const requestsBeforePlaceDetails = placesApiRequestCount;
  await tapTestId(client, "explore-nearby-place-0");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-nearby-place-details"]'))`,
    Boolean,
    "the selected business detail card",
    10_000,
  );
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="explore-nearby-place-details-loaded"]') || document.querySelector('[data-testid="explore-nearby-place-details-error"]'))`,
    Boolean,
    "the Place Details response or its visible fallback",
    15_000,
  );
  const selectedPlaceState = await client.evaluate(`(() => ({
    card: document.querySelector('[data-testid="explore-nearby-place-details"]')?.innerText ?? '',
    loaded: Boolean(document.querySelector('[data-testid="explore-nearby-place-details-loaded"]')),
    error: Boolean(document.querySelector('[data-testid="explore-nearby-place-details-error"]')),
  }))()`);
  assert.equal(
    selectedPlaceState.loaded,
    true,
    `The selected Google business should show its details. State: ${JSON.stringify(selectedPlaceState)}; Places responses: ${JSON.stringify(placesResponses)}; Browser errors: ${JSON.stringify(browserErrors)}`,
  );
  assert.ok(
    placesApiRequestCount > requestsBeforePlaceDetails,
    "Selecting a business should request its details only after the user opens it.",
  );

  const requestsBeforeCameraMove = placesApiRequestCount;
  await tapTestId(client, "explore-map-tools-close");
  const mapPoint = await client.evaluate(`(() => {
    const map = document.querySelector('#explore-google-map');
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width * 0.5),
      y: Math.round(rect.top + rect.height * 0.48),
      width: rect.width,
      height: rect.height,
    };
  })()`);
  assert.ok(mapPoint && mapPoint.width > 0 && mapPoint.height > 0, "The road map should have a draggable viewport.");
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: mapPoint.x,
    y: mapPoint.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: mapPoint.x - 70,
    y: mapPoint.y + 25,
    button: "left",
    buttons: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: mapPoint.x - 120,
    y: mapPoint.y + 45,
    button: "left",
    buttons: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: mapPoint.x - 120,
    y: mapPoint.y + 45,
    button: "left",
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  assert.equal(
    placesApiRequestCount,
    requestsBeforeCameraMove,
    "Panning the map should not automatically issue another nearby Places search.",
  );
  await tapTestId(client, "explore-map-tools-toggle");
  await tapTestId(client, "explore-map-search-area");
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  assert.ok(
    placesApiRequestCount > requestsBeforeCameraMove,
    "The Search nearby action should issue a fresh Places search at the latest map centre.",
  );
  assert.equal(interceptionError, undefined, "Application API interception should complete without errors.");
});