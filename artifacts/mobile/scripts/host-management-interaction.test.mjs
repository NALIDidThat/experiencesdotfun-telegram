import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const viewport = { width: 390, height: 740 };
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
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-host-management-test-"));
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

async function setViewport(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function tapSelector(client, selector) {
  const selectorValue = JSON.stringify(selector);
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${selectorValue});
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
  assert.ok(point, `Expected control matching "${selector}" to be present.`);
  assert.ok(point.visible, `Expected control matching "${selector}" to be visible.`);
  assert.ok(!point.disabled, `Expected control matching "${selector}" to be enabled.`);
  const { x, y } = point;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function tapTestId(client, testId) {
  await tapSelector(client, `[data-testid="${testId}"]`);
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

function makeFixtures() {
  const organisation = {
    id: 700,
    name: "Host QA Community",
    description: "A temporary in-memory host fixture.",
    city: "London",
    country: "UK",
    categories: ["environmental"],
    verified: true,
  };
  const user = {
    id: 701,
    createdAt: "2026-01-01T00:00:00.000Z",
    telegramId: null,
    email: "host.qa@example.test",
    name: "Host QA",
    username: "host_qa",
    avatarUrl: null,
    bio: null,
    city: "London",
    country: "UK",
    socialLinks: {},
    interests: ["environmental"],
    participationType: null,
    userType: "organisation",
    organisation,
    xp: 0,
    level: "Explorer",
    completedCount: 0,
    hostedCount: 1,
    rewardsPence: 0,
  };
  const experience = {
    id: 740,
    organisation,
    title: "Community Garden Morning",
    description: "Tend the neighbourhood garden together.",
    category: "environmental",
    date: "2026-12-12",
    startTime: "10:00",
    endTime: "12:00",
    location: "Community Garden",
    city: "London",
    capacity: 4,
    participantCount: 4,
    availablePlaces: 0,
    xpReward: 100,
    monetaryRewardPence: null,
    status: "full",
    waitlistCount: 1,
  };
  const people = [
    { id: 7401, name: "Avery Joined", username: "avery_joined", status: "joined" },
    { id: 7402, name: "Blake Attended", username: "blake_attended", status: "attended" },
    { id: 7403, name: "Casey Submitted", username: "casey_submitted", status: "submitted" },
    { id: 7404, name: "Devon Submitted", username: "devon_submitted", status: "submitted" },
    { id: 7405, name: "Emery Waitlisted", username: "emery_waitlisted", status: "waitlisted" },
  ].map((person, index) => ({
    id: person.id,
    experience,
    participant: { id: person.id + 1000, name: person.name, username: person.username, avatarUrl: null },
    status: person.status,
    joinedAt: `2026-09-2${index + 1}T10:00:00.000Z`,
    attendedAt: person.status === "attended" ? "2026-09-29T11:00:00.000Z" : null,
    submittedAt: person.status === "submitted" ? `2026-09-3${index - 1}T12:00:00.000Z` : null,
    verifiedAt: null,
    rewardStatus: "pending",
  }));
  return { organisation, user, experience, people };
}

test("organisation hosts can manage experience participants from a phone-sized detail screen", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the host management preview test.");

  const client = await launchBrowser(t);
  const { user, experience, people } = makeFixtures();
  const requests = [];
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  let attendanceFailuresRemaining = 1;
  const baseExperience = { ...experience };

  function currentExperience() {
    const participantCount = people.filter((person) => person.status !== "waitlisted").length;
    const waitlistCount = people.filter((person) => person.status === "waitlisted").length;
    return {
      ...baseExperience,
      participantCount,
      waitlistCount,
      availablePlaces: Math.max(0, baseExperience.capacity - participantCount),
    };
  }

  function hostOverview() {
    return {
      organisation: user.organisation,
      upcomingExperiences: 1,
      participantCount: people.filter((person) => ["joined", "attended", "submitted", "verified"].includes(person.status)).length,
      waitlistCount: people.filter((person) => person.status === "waitlisted").length,
      pendingVerifications: people.filter((person) => person.status === "submitted").length,
      totalExperiences: 1,
    };
  }

  function participantResponse(person) {
    return { ...person, experience: currentExperience() };
  }

  client.on("Fetch.requestPaused", ({ params }) => {
    void (async () => {
      try {
        const url = new URL(params.request.url);
        if (!url.pathname.startsWith("/api/")) {
          await client.send("Fetch.continueRequest", { requestId: params.requestId });
          return;
        }
        const method = params.request.method;
        apiTraffic.push(`${method} ${url.pathname}`);
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
          response = user;
        } else if (url.pathname === "/api/host/overview" && method === "GET") {
          response = hostOverview();
        } else if (url.pathname === "/api/host/experiences" && method === "GET") {
          response = [currentExperience()];
        } else if (url.pathname === `/api/host/experiences/${experience.id}/participants` && method === "GET") {
          response = people.map(participantResponse);
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          const attendanceMatch = url.pathname.match(/^\/api\/host\/participations\/(\d+)\/attend$/);
          const verifyMatch = url.pathname.match(/^\/api\/host\/participations\/(\d+)\/verify$/);
          const rejectMatch = url.pathname.match(/^\/api\/host\/participations\/(\d+)\/reject$/);
          const promoteMatch = url.pathname.match(/^\/api\/host\/experiences\/(\d+)\/promote-next$/);
          if (attendanceMatch && method === "POST") {
            const person = people.find((item) => item.id === Number(attendanceMatch[1]));
            requests.push({ method, path: url.pathname });
            if (attendanceFailuresRemaining > 0) {
              attendanceFailuresRemaining -= 1;
              status = 503;
              response = { message: "Attendance could not be saved right now. Try again." };
            } else if (person?.status === "joined") {
              person.status = "attended";
              person.attendedAt = "2026-09-30T10:30:00.000Z";
              response = participantResponse(person);
            } else {
              status = 409;
              response = { message: "Only joined participants can be marked as attended." };
            }
          } else if (verifyMatch && method === "POST") {
            const person = people.find((item) => item.id === Number(verifyMatch[1]));
            requests.push({ method, path: url.pathname });
            if (person?.status === "submitted") {
              person.status = "verified";
              person.verifiedAt = "2026-09-30T10:30:00.000Z";
              person.rewardStatus = "issued";
              response = participantResponse(person);
            } else {
              status = 409;
              response = { message: "This contribution is no longer awaiting review." };
            }
          } else if (rejectMatch && method === "POST") {
            const person = people.find((item) => item.id === Number(rejectMatch[1]));
            requests.push({ method, path: url.pathname });
            if (person?.status === "submitted") {
              person.status = "rejected";
              response = participantResponse(person);
            } else {
              status = 409;
              response = { message: "This contribution is no longer awaiting review." };
            }
          } else if (promoteMatch && method === "POST" && Number(promoteMatch[1]) === experience.id) {
            const next = people.find((item) => item.status === "waitlisted");
            requests.push({ method, path: url.pathname });
            if (next) {
              next.status = "joined";
              next.joinedAt = "2026-09-30T10:30:00.000Z";
              baseExperience.capacity = Math.max(baseExperience.capacity, people.filter((item) => item.status !== "waitlisted").length);
              baseExperience.status = "published";
              response = participantResponse(next);
            } else {
              status = 409;
              response = { message: "There is no one on this waitlist to promote." };
            }
          } else {
            unexpectedApiRequests.push(`${method} ${url.pathname}`);
            status = 404;
            response = { message: "Unexpected API request in host management test." };
          }
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, domain),
          body: Buffer.from(JSON.stringify(response)).toString("base64"),
        });
      } catch (error) {
        unexpectedApiRequests.push(error.message);
        await client.send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "Failed",
        }).catch(() => {});
      }
    })();
  });

  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "localStorage.setItem('@experiences/auth-token', 'email_host-management-test');",
  });
  await setViewport(client);
  await client.send("Page.navigate", { url: `https://${domain}/?screen=host` });

  try {
    await waitForValue(
      client,
      `(() => ({
        found: Boolean(document.querySelector('[data-testid="host-experience-${experience.id}"]')),
        text: document.body?.innerText?.slice(0, 500) ?? '',
        token: localStorage.getItem('@experiences/auth-token'),
        url: location.href,
      }))()`,
      (state) => state.found,
      "the host experience list",
    );
  } catch (error) {
    throw new Error(`${error.message}\nAPI traffic: ${JSON.stringify(apiTraffic)}\nUnexpected: ${JSON.stringify(unexpectedApiRequests)}`);
  }
  await tapTestId(client, `host-experience-${experience.id}`);
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-detail-filter-all"]'))`,
    Boolean,
    "the host experience detail screen",
  );
  await waitForValue(
    client,
    `document.querySelector('[data-testid="host-detail-filter-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (value) => value === "All 5",
    "the host participant records to load",
  );

  const initialLayout = await client.evaluate(`(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    shellHeight: document.querySelector('[data-testid="app-shell"]')?.getBoundingClientRect().height ?? null,
    bottomNavTabs: document.querySelectorAll('[data-testid^="bottom-nav-tab-"]').length,
    peopleCount: document.querySelector('[data-testid="host-detail-filter-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
    participantCount: document.querySelector('[data-testid="host-detail-filter-participants"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
    reviewCount: document.querySelector('[data-testid="host-detail-filter-review"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
    waitlistCount: document.querySelector('[data-testid="host-detail-filter-waitlisted"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
  }))()`);
  assert.equal(initialLayout.width, viewport.width);
  assert.equal(initialLayout.height, viewport.height);
  assert.ok(Math.abs(initialLayout.shellHeight - viewport.height) <= 4);
  assert.equal(initialLayout.bottomNavTabs, 0, "The experience detail screen must not show bottom navigation.");
  assert.equal(initialLayout.peopleCount, "All 5");
  assert.equal(initialLayout.participantCount, "Participants 4");
  assert.equal(initialLayout.reviewCount, "To review 2");
  assert.equal(initialLayout.waitlistCount, "Waitlist 1");

  await tapTestId(client, "host-detail-filter-waitlisted");
  await waitForValue(
    client,
    `document.body.innerText.includes('1 of 5 people') && document.body.innerText.includes('Emery Waitlisted')`,
    Boolean,
    "the waitlist filter and matching participant",
  );
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('Avery Joined')`),
    false,
    "The waitlist filter must not include confirmed participants.",
  );

  await tapTestId(client, "host-detail-filter-participants");
  await waitForValue(
    client,
    `document.body.innerText.includes('4 of 5 people') && document.body.innerText.includes('Avery Joined')`,
    Boolean,
    "the participants filter",
  );
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('Emery Waitlisted')`),
    false,
    "The participants filter must exclude waitlisted people.",
  );

  await tapTestId(client, "host-detail-filter-review");
  await waitForValue(
    client,
    `document.body.innerText.includes('2 of 5 people') && document.body.innerText.includes('Casey Submitted') && document.body.innerText.includes('Devon Submitted')`,
    Boolean,
    "the completion review filter",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="host-verify-7403"]')) && Boolean(document.querySelector('[data-testid="host-reject-7404"]'))`),
    true,
    "Submitted completions should expose verify and reject actions.",
  );

  await tapTestId(client, "host-detail-filter-participants");
  await tapTestId(client, "host-attend-7401");
  await waitForValue(
    client,
    `document.body.innerText.includes('Attendance could not be saved right now. Try again.')`,
    Boolean,
    "a clear attendance error after the failed save",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="host-attend-7401"]'))`),
    true,
    "The attendance action should remain available after a failed request.",
  );
  await tapTestId(client, "host-attend-7401");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-attend-7401"]') && document.body.innerText.includes('Attendance recorded')`,
    Boolean,
    "attendance to update after retry",
  );

  await tapTestId(client, "host-detail-filter-review");
  await tapTestId(client, "host-verify-7403");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-verify-7403"]') && document.body.innerText.includes('1 of 5 people')`,
    Boolean,
    "the review list to update after verification",
  );
  await tapTestId(client, "host-detail-filter-all");
  await waitForValue(
    client,
    `document.body.innerText.includes('Completion approved')`,
    Boolean,
    "verified completion state",
  );

  await tapTestId(client, "host-detail-filter-review");
  await tapTestId(client, "host-reject-7404");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-reject-7404"]') && document.body.innerText.includes('No matching people')`,
    Boolean,
    "the review list to update after rejection",
  );
  await tapTestId(client, "host-detail-filter-all");
  await waitForValue(
    client,
    `document.body.innerText.includes('Completion was rejected')`,
    Boolean,
    "rejected completion state",
  );

  await tapTestId(client, "host-detail-filter-waitlisted");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-promote-next"]'))`,
    Boolean,
    "the waitlist promotion action",
  );
  await tapTestId(client, "host-promote-next");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-promote-next"]') && document.body.innerText.includes('0 of 5 people')`,
    Boolean,
    "the empty waitlist after promotion",
  );
  await tapTestId(client, "host-detail-filter-participants");
  await waitForValue(
    client,
    `document.body.innerText.includes('5 of 5 people') && document.body.innerText.includes('Emery Waitlisted') && !document.body.innerText.includes('Waitlist position')`,
    Boolean,
    "the promoted participant in the confirmed list",
  );

  await tapSelector(client, '[aria-label="Go back"]');
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-experience-${experience.id}"]')) && document.body.innerText.includes('Host tools')`,
    Boolean,
    "returning to Host tools",
  );
  assert.deepEqual(
    requests.map(({ path }) => path),
    [
      `/api/host/participations/7401/attend`,
      `/api/host/participations/7401/attend`,
      `/api/host/participations/7403/verify`,
      `/api/host/participations/7404/reject`,
      `/api/host/experiences/${experience.id}/promote-next`,
    ],
    "All host management actions should reach their expected API endpoints.",
  );
  assert.deepEqual(unexpectedApiRequests, [], "The screen should only request mocked host APIs.");
});