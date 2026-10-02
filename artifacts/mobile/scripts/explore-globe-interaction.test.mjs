import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

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
  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression);
    if (predicate(lastValue)) return lastValue;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${JSON.stringify(lastValue)}`);
}

async function tapElement(client, selector, description) {
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
      target.scrollIntoView({ block: "center", inline: "nearest" });
      rect = target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    const hit = document.elementFromPoint(x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      tag: target.tagName,
      hitTag: hit?.tagName ?? null,
      hitLabel: hit?.getAttribute("aria-label") ?? null,
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
  return point;
}

async function tapTestId(client, testId) {
  await tapElement(client, `[data-testid="${testId}"]`, `control "${testId}"`);
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
    capacity: 12,
    participantCount: 2,
    availablePlaces: 10,
    xpReward: 100,
    monetaryRewardPence: null,
    status: "published",
  };
}

const experiences = [
  makeExperience(761, "London River Cleanup", "environmental", "London"),
  makeExperience(762, "London Neighbourhood Meetup", "community", "London"),
  makeExperience(763, "New York Learning Circle", "education", "New York"),
  makeExperience(764, "Toronto Park Planting", "environmental", "Toronto"),
  makeExperience(765, "Springfield Food Sharing", "community", "Springfield"),
];

test("Explore Globe markers, city filtering, zoom controls, and categories stay interactive", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the Explore Globe preview test.");

  const client = await launchBrowser(t);
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  let interceptionError;

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
        } else if (url.pathname === "/api/experiences" && method === "GET") {
          const category = url.searchParams.get("category");
          response = category
            ? experiences.filter((experience) => experience.category === category)
            : experiences;
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}${url.search}`);
          status = 404;
          response = { message: "Unexpected API request in Explore Globe test." };
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
  await client.send("Page.navigate", { url: `https://${domain}/?screen=explore` });

  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "5 experiences",
    "the authenticated Explore experience results",
  );
  assert.ok(
    await client.evaluate(`[...document.querySelectorAll('*')].some((element) => element.children.length === 0 && element.textContent.trim() === 'Explore')`),
    "Explore screen should be displayed.",
  );

  const initialCards = await client.evaluate(
    ` [...document.querySelectorAll('[data-testid^="explore-experience-card-"]')].map((element) => element.getAttribute('data-testid'))`,
  );
  assert.equal(initialCards.length, experiences.length, "All returned experiences should be listed.");
  assert.ok(initialCards.includes("explore-experience-card-765"), "The unmapped city's experience stays in the list.");
  assert.ok(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="London: 2 experiences"]'))`),
    "The mapped London marker should show its aggregate count.",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[aria-label="Springfield: 1 experiences"]'))`),
    false,
    "An unmapped city should not get a globe marker.",
  );

  const markerPoint = await tapElement(client, '[aria-label="London: 2 experiences"]', "the London globe marker");
  try {
    await waitForValue(
      client,
      `document.querySelector('[data-testid="explore-globe-city-action"]')?.getAttribute('aria-label') ?? ''`,
      (label) => label === "Explore experiences in London",
      "the London city preview action",
      5_000,
    );
  } catch (error) {
    const markerState = await client.evaluate(`(() => {
      const marker = document.querySelector('[aria-label="London: 2 experiences"]');
      return {
        markerHtml: marker?.outerHTML?.slice(0, 500) ?? null,
        markerRole: marker?.getAttribute('role') ?? null,
        previewExists: Boolean(document.querySelector('[data-testid="explore-globe-city-action"]')),
      };
    })()`);
    throw new Error(`${error.message} Marker point: ${JSON.stringify(markerPoint)}. Marker state: ${JSON.stringify(markerState)}`);
  }
  if (process.env.EXPLORE_GLOBE_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(process.env.EXPLORE_GLOBE_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }
  await tapTestId(client, "explore-globe-city-action");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "2 experiences",
    "the London-filtered experience list",
  );
  const londonCards = await client.evaluate(
    ` [...document.querySelectorAll('[data-testid^="explore-experience-card-"]')].map((element) => element.getAttribute('data-testid'))`,
  );
  assert.deepEqual(londonCards.sort(), ["explore-experience-card-761", "explore-experience-card-762"]);

  await tapTestId(client, "explore-clear-city");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="explore-results-count"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (text) => text === "5 experiences",
    "the restored unfiltered experience list",
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
  await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => radius === initialRadius,
    "the initial globe scale after zooming out",
  );
  await tapTestId(client, "explore-globe-zoom-in");
  await tapTestId(client, "explore-globe-reset");
  await waitForValue(
    client,
    `document.querySelector('svg defs circle')?.getAttribute('r') ?? ''`,
    (radius) => radius === initialRadius,
    "the reset globe scale",
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

  await waitForValue(client, "document.readyState", (state) => state === "complete", "the Explore page load");
  assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/me")), "The mock-auth session should load.");
  assert.ok(apiTraffic.some((request) => request.startsWith("GET /api/experiences")), "Experiences should be fetched.");
  assert.equal(interceptionError, undefined, "API request interception should complete without errors.");
  assert.deepEqual(unexpectedApiRequests, [], "The Explore screen should make no unexpected API requests.");
});