import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { getAppPreviewUrl } from "./preview-test-config.mjs";

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

async function waitForStableElementBounds(client, selector, description) {
  const selectorValue = JSON.stringify(selector);
  const samples = [];
  await waitForValue(
    client,
    `(() => {
      const element = document.querySelector(${selectorValue});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      };
    })()`,
    (bounds) => {
      if (!bounds
        || bounds.top < 0
        || bounds.bottom > bounds.viewportHeight
        || bounds.width <= 0
        || bounds.height <= 0) {
        samples.length = 0;
        return false;
      }
      samples.push(bounds);
      if (samples.length > 4) samples.shift();
      return samples.length === 4 && samples.every((sample) => (
        Math.abs(sample.top - bounds.top) < 0.5
        && Math.abs(sample.bottom - bounds.bottom) < 0.5
        && Math.abs(sample.height - bounds.height) < 0.5
      ));
    },
    description,
  );
}

async function waitForStableValue(client, expression, predicate, description) {
  const samples = [];
  return waitForValue(client, expression, (value) => {
    if (!predicate(value)) {
      samples.length = 0;
      return false;
    }
    samples.push(value);
    if (samples.length > 4) samples.shift();
    return samples.length === 4 && samples.every((sample) => sample === value);
  }, description);
}

async function tapSelector(client, selector, { scrollIntoView = true } = {}) {
  const selectorValue = JSON.stringify(selector);
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${selectorValue});
    if (!element) return null;
    if (${scrollIntoView}) element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      visible: rect.width > 0 && rect.height > 0
        && rect.top >= 0
        && rect.bottom <= (window.visualViewport?.height ?? window.innerHeight),
      disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
      hitTargetMatches: Boolean(hitTarget && (hitTarget === element || element.contains(hitTarget))),
    };
  })()`);
  assert.ok(point, `Expected control matching "${selector}" to be present.`);
  assert.ok(point.visible, `Expected control matching "${selector}" to be visible.`);
  assert.ok(!point.disabled, `Expected control matching "${selector}" to be enabled.`);
  assert.ok(point.hitTargetMatches, `Expected the tap point to resolve to "${selector}".`);
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

async function revealInScrollableAncestor(client, selector) {
  const selectorValue = JSON.stringify(selector);
  return client.evaluate(`(() => {
    const target = document.querySelector(${selectorValue});
    if (!target) return false;
    let ancestor = target.parentElement;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      const isScrollable = ['auto', 'scroll'].includes(style.overflowY)
        && ancestor.scrollHeight > ancestor.clientHeight + 1;
      if (isScrollable) {
        const targetRect = target.getBoundingClientRect();
        const ancestorRect = ancestor.getBoundingClientRect();
        if (targetRect.bottom > ancestorRect.bottom) {
          ancestor.scrollTop += targetRect.bottom - ancestorRect.bottom;
        } else if (targetRect.top < ancestorRect.top) {
          ancestor.scrollTop -= ancestorRect.top - targetRect.top;
        }
        return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  })()`);
}

async function tapTestId(client, testId, {
  scrollIntoView = true,
  waitForStable = false,
  revealInScrollContainer = false,
} = {}) {
  const selector = `[data-testid="${testId}"]`;
  if (revealInScrollContainer) await revealInScrollableAncestor(client, selector);
  if (waitForStable) {
    await waitForStableElementBounds(client, selector, `the ${testId} control to settle in view`);
  }
  await tapSelector(client, selector, { scrollIntoView });
}

async function revealParticipantControl(client, testId) {
  const selector = `[data-testid="${testId}"]`;
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-participant-sheet"]') && document.querySelector(${JSON.stringify(selector)}))`,
    Boolean,
    `${testId} in the participant sheet`,
  );
  await waitForStableElementBounds(
    client,
    '[data-testid="host-participant-sheet"]',
    "the participant sheet to finish opening",
  );
  await revealInScrollableAncestor(client, selector);
  await waitForStableElementBounds(client, selector, `${testId} to settle in view`);
}

async function replaceInput(client, testId, value, options) {
  await tapTestId(client, testId, options);
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
  });
  await client.send("Input.insertText", { text: value });
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

function makeFixtures() {
  const organisation = {
    id: 700,
    name: "Host QA Community",
    description: "A temporary in-memory host fixture.",
    city: "London",
    country: "UK",
    categories: ["environmental"],
    type: "nonprofit",
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
    completionStatement: person.status === "submitted" ? `${person.name} completed the garden preparation.` : null,
    evidenceObjectKeys: [],
    submissionVersion: 1,
    reviewReason: null,
    reviewedAt: null,
    reviewHistory: [],
    rewardStatus: "pending",
  }));
  return { organisation, user, experience, people };
}

test("organisation hosts can manage experience participants from a phone-sized detail screen", async (t) => {
  const appUrl = getAppPreviewUrl("The host management preview test");
  const appBaseUrl = process.env.HOST_MANAGEMENT_APP_URL ?? appUrl;
  const appOrigin = new URL(appBaseUrl).origin;

  const client = await launchBrowser(t);
  const { user, experience, people } = makeFixtures();
  const requests = [];
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  let attendanceFailuresRemaining = 1;
  const baseExperience = { ...experience };
  const milestoneRecords = [{
    id: 7410,
    position: 1,
    title: "Garden prepared",
    description: "Clear the beds and prepare the soil.",
    xpReward: 100,
  }];
  const milestoneSubmissions = [{
    id: 7411,
    participationId: 7401,
    milestoneId: 7410,
    participant: { id: 17401, name: "Avery Joined", username: "avery_joined", avatarUrl: null },
    milestoneTitle: "Garden prepared",
    milestonePosition: 1,
    xpReward: 100,
    status: "submitted",
    submittedAt: "2026-09-30T12:00:00.000Z",
    verifiedAt: null,
    evidenceObjectKeys: ["private/participant/avery/milestone-proof.jpg"],
    reviewReason: null,
    submissionVersion: 1,
  }, {
    id: 7412,
    participationId: 7402,
    milestoneId: 7410,
    participant: { id: 17402, name: "Blake Attended", username: "blake_attended", avatarUrl: null },
    milestoneTitle: "Garden prepared",
    milestonePosition: 1,
    xpReward: 100,
    status: "verified",
    submittedAt: "2026-09-28T12:00:00.000Z",
    verifiedAt: "2026-09-29T12:00:00.000Z",
    evidenceObjectKeys: [],
    reviewReason: null,
    submissionVersion: 1,
  }];

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
      monthlyVerifiedCompletions: 0,
      pendingVerifications: people.filter((person) => person.status === "submitted").length + milestoneSubmissions.length,
      pendingCompletionReviews: people.filter((person) => person.status === "submitted").length,
      pendingMilestoneReviews: milestoneSubmissions.filter((item) => item.status === "submitted").length,
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
              ...apiResponseHeaders(params.request, appOrigin),
              { name: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, OPTIONS" },
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
        } else if (url.pathname === "/api/friends" && method === "GET") {
          response = [];
        } else if (url.pathname === "/api/friends/notifications" && method === "GET") {
          response = { notifications: [], unreadCount: 0 };
        } else if (url.pathname === "/api/organisations/verification" && method === "GET") {
          response = { status: "unsubmitted" };
        } else if (url.pathname === "/api/host/overview" && method === "GET") {
          response = hostOverview();
        } else if (url.pathname === "/api/host/experiences" && method === "GET") {
          response = [currentExperience()];
        } else if (url.pathname === `/api/experiences/${experience.id}` && method === "GET") {
          response = {
            ...currentExperience(),
            whatToBring: "Comfortable shoes",
            whatYouWillDo: "Tend the garden",
            hasJoined: false,
            myParticipation: null,
            milestones: [],
          };
        } else if (url.pathname === `/api/host/experiences/${experience.id}/participants` && method === "GET") {
          response = people.map(participantResponse);
        } else if (url.pathname === `/api/host/experiences/${experience.id}/milestones` && method === "GET") {
          response = {
            milestones: milestoneRecords,
            submissions: milestoneSubmissions,
            milestonesEditable: milestoneSubmissions.length === 0,
          };
        } else if (url.pathname === `/api/host/experiences/${experience.id}` && method === "PATCH") {
          const body = JSON.parse(params.request.postData ?? "{}");
          requests.push({ method, path: url.pathname, body });
          Object.assign(baseExperience, {
            title: body.title,
            description: body.description,
            date: body.date,
            startTime: body.startTime,
            endTime: body.endTime,
            location: body.location,
            city: body.city,
            capacity: body.capacity,
            xpReward: body.xpReward,
            monetaryRewardPence: body.monetaryRewardPence,
            status: people.filter((person) => person.status !== "waitlisted").length >= body.capacity ? "full" : "published",
          });
          response = currentExperience();
        } else if (url.pathname === `/api/host/experiences/${experience.id}/cancel` && method === "POST") {
          requests.push({ method, path: url.pathname });
          baseExperience.status = "cancelled";
          response = currentExperience();
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
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
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
    source: "localStorage.setItem('@experiences/auth-token', 'email_host-management-test'); window.__telegramShareLinks = []; window.Telegram = { WebApp: { openTelegramLink: (url) => window.__telegramShareLinks.push(url) } };",
  });
  await setViewport(client);
  await client.send("Page.navigate", { url: `${appBaseUrl}/?screen=profile` });
  try {
    await waitForValue(
      client,
      `document.querySelector('[data-testid="organisation-activity-experience-${experience.id}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text.includes(experience.title) && text.includes("4 registrations") && text.includes("1 waitlisted"),
      "the organisation's hosted activity and participation records on its profile",
    );
  } catch (error) {
    const browserState = await client.evaluate(`({
      url: location.href,
      text: document.body?.innerText?.slice(0, 1200) ?? "",
      dashboard: Boolean(document.querySelector('[data-testid="organisation-activity-dashboard"]')),
      profile: Boolean(document.querySelector('[data-testid="profile-screen"]')),
    })`);
    throw new Error(`${error.message} Browser state: ${JSON.stringify(browserState)}; API traffic: ${apiTraffic.join(", ")}; unexpected: ${unexpectedApiRequests.join(", ")}`);
  }
  const organisationStats = await client.evaluate(`(() => ({
    stats: [...document.querySelectorAll('[data-testid^="organisation-activity-stat-"]')]
      .map((element) => element.innerText.replace(/[^\\x20-\\x7E]/g, ' ').replace(/\\s+/g, ' ').trim()),
    participantXpVisible: Boolean(document.querySelector('[data-testid="profile-metric-xp"]')),
  }))()`);
  assert.deepEqual(
    organisationStats.stats,
    ["1 Experiences", "1 Upcoming", "4 Registrations", "1 Waitlist"],
    "Organisation profile stats should come from the organisation's hosted activity.",
  );
  assert.equal(
    organisationStats.participantXpVisible,
    false,
    "An organisation profile should not show participant XP metrics.",
  );
  if (process.env.ORGANISATION_PROFILE_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      process.env.ORGANISATION_PROFILE_SCREENSHOT_PATH,
      Buffer.from(screenshot.data, "base64"),
    );
  }
  await tapTestId(client, `organisation-activity-experience-${experience.id}`);
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-detail-tab-participants"]'))`,
    Boolean,
    "the host experience detail screen opened from organisation activity",
  );
  await tapTestId(client, "host-share-telegram");
  const telegramShare = await client.evaluate(`(() => {
    const raw = window.__telegramShareLinks?.at(-1) ?? '';
    if (!raw) return null;
    const link = new URL(raw);
    return { url: link.searchParams.get('url'), text: link.searchParams.get('text') };
  })()`);
  assert.equal(
    telegramShare?.url,
    `https://experiences.fun/?screen=experience&id=${experience.id}`,
    "The share action should open Telegram's chooser with the published experience link.",
  );
  assert.ok(
    telegramShare?.text?.includes(experience.title),
    "The Telegram share text should identify the experience.",
  );
  await tapTestId(client, "host-detail-tab-participants");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-detail-filter-all"]'))`,
    Boolean,
    "the participant section opened from organisation activity",
  );

  await client.send("Page.navigate", { url: `${appBaseUrl}/?screen=host` });

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
    `Boolean(document.querySelector('[data-testid="host-detail-tab-participants"]'))`,
    Boolean,
    "the host experience detail screen",
  );
  await tapTestId(client, "host-detail-tab-participants");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="host-detail-filter-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (value) => value === "All 5",
    "the host participant records to load",
  );

  if (process.env.HOST_MANAGEMENT_SCREENSHOT_PATH) {
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(process.env.HOST_MANAGEMENT_SCREENSHOT_PATH, Buffer.from(screenshot.data, "base64"));
  }

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
  assert.equal(initialLayout.reviewCount, "Completions 2");
  assert.equal(initialLayout.waitlistCount, "Waitlist 1");

  await tapTestId(client, "host-participant-card-7402");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-participant-sheet"]')) && Boolean(document.querySelector('[data-testid="host-participant-milestone-7412"]'))`,
    Boolean,
    "a participant contribution sheet with verified milestone history",
  );
  assert.equal(
    await client.evaluate(`document.querySelector('[data-testid="host-participant-milestone-7412"]')?.innerText.includes('Verified')`),
    true,
    "The participant sheet should show completed milestone contribution records.",
  );
  await tapTestId(client, "host-participant-sheet-close", { scrollIntoView: false, waitForStable: true });
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-participant-sheet"]')`,
    Boolean,
    "the participant sheet to close",
  );

  await tapTestId(client, "host-detail-filter-waitlisted");
  await waitForValue(
    client,
    `document.body.innerText.includes('1 of 5 people') && document.body.innerText.includes('Emery Waitlisted')`,
    Boolean,
    "the waitlist filter and matching participant",
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
  await tapTestId(client, "host-participant-card-7403");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-participant-sheet"]')) && Boolean(document.querySelector('[data-testid="host-verify-7403"]'))`,
    Boolean,
    "the selected participant’s completion review actions",
  );
  assert.equal(
    await client.evaluate(`Boolean(document.querySelector('[data-testid="host-verify-7403"]')) && Boolean(document.querySelector('[data-testid="host-reject-with-reason-7403"]'))`),
    true,
    "The selected participant sheet should expose its verify and reject actions.",
  );
  await tapTestId(client, "host-participant-sheet-close", { scrollIntoView: false, waitForStable: true });

  await tapTestId(client, "host-detail-filter-participants");
  await tapTestId(client, "host-participant-card-7401");
  await revealParticipantControl(client, "host-attend-7401");
  await tapTestId(client, "host-attend-7401", { scrollIntoView: false });
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
  await revealParticipantControl(client, "host-attend-7401");
  await tapTestId(client, "host-attend-7401", { scrollIntoView: false });
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-attend-7401"]') && document.body.innerText.includes('Attendance recorded')`,
    Boolean,
    "attendance to update after retry",
  );
  await tapTestId(client, "host-participant-sheet-close", { scrollIntoView: false, waitForStable: true });

  await tapTestId(client, "host-detail-filter-review");
  await tapTestId(client, "host-participant-card-7403");
  await revealParticipantControl(client, "host-verify-7403");
  await tapTestId(client, "host-verify-7403", { scrollIntoView: false });
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-verify-7403"]') && document.body.innerText.includes('1 of 5 people')`,
    Boolean,
    "the review list to update after verification",
  );
  await tapTestId(client, "host-participant-sheet-close", { scrollIntoView: false, waitForStable: true });
  await tapTestId(client, "host-detail-filter-all");
  await waitForValue(
    client,
    `document.body.innerText.includes('Completion approved')`,
    Boolean,
    "verified completion state",
  );

  await tapTestId(client, "host-detail-filter-review");
  await tapTestId(client, "host-participant-card-7404");
  await revealParticipantControl(client, "host-reject-reason-7404");
  await replaceInput(
    client,
    "host-reject-reason-7404",
    "Please add a clearer account of the task.",
    { scrollIntoView: false },
  );
  await revealParticipantControl(client, "host-reject-with-reason-7404");
  await tapTestId(client, "host-reject-with-reason-7404", { scrollIntoView: false });
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="host-reject-with-reason-7404"]') && document.body.innerText.includes('No matching people')`,
    Boolean,
    "the review list to update after rejection",
  );
  await tapTestId(client, "host-participant-sheet-close", { scrollIntoView: false, waitForStable: true });
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

  await tapTestId(client, "host-edit-experience");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the prefilled experience review before editing",
  );
  await tapTestId(client, "create-review-milestones");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-milestone-title-1"]')) && document.body.innerText.includes('Milestone steps are locked')`,
    Boolean,
    "milestone definitions to be locked after a participant submission",
  );
  assert.equal(
    await client.evaluate(`(() => {
      const input = document.querySelector('[data-testid="create-milestone-title-1"]');
      return Boolean(input?.disabled || input?.readOnly || input?.getAttribute('aria-readonly') === 'true');
    })()`),
    true,
    "A submitted milestone's definition should be read-only.",
  );
  await tapTestId(client, "create-primary");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the review after checking the locked milestone",
  );
  await tapTestId(client, "create-review-title");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-field-title"]'))`,
    Boolean,
    "the title field in edit mode",
  );
  await replaceInput(client, "create-field-title", "Community Garden Morning Updated");
  await tapTestId(client, "create-primary");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the review after changing the title",
  );
  await tapTestId(client, "create-primary");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-edit-experience"]')) && document.body.innerText.includes('Community Garden Morning Updated')`,
    Boolean,
    "the updated title in host management",
  );

  await tapTestId(client, "host-cancel-experience");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-cancel-confirmation"]'))`,
    Boolean,
    "the cancellation confirmation before changes are saved",
  );
  await tapTestId(client, "host-cancel-confirm");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-cancelled-notice"]')) && !document.querySelector('[data-testid="host-edit-experience"]')`,
    Boolean,
    "the cancelled experience state with editing and sign-up controls closed",
  );
  await tapTestId(client, "host-detail-tab-participants");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="host-detail-filter-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    (value) => value === "All 5",
    "existing participant records to remain accessible after cancellation",
  );
  assert.equal(
    await client.evaluate(`document.querySelector('[data-testid="host-detail-filter-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`),
    "All 5",
    "Cancellation must keep existing participant records visible.",
  );
  await tapTestId(client, "host-detail-tab-milestones");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-milestone-7410"]'))`,
    Boolean,
    "the milestone timeline after cancellation",
  );
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('Garden prepared')`),
    true,
    "Cancellation must keep milestone definitions visible.",
  );
  await tapTestId(client, "host-detail-tab-participants");
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('Avery Joined')`),
    true,
    "Cancellation must keep participant records visible.",
  );

  await tapSelector(client, '[aria-label="Go back"]');
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-experience-${experience.id}"]')) && document.body.innerText.includes('Host tools')`,
    Boolean,
    "returning to Host tools",
  );
  assert.equal(
    await client.evaluate(`document.body.innerText.includes('Completion reviews') && document.body.innerText.includes('Milestone reviews')`),
    true,
    "The host overview should label completion and milestone review counts separately.",
  );
  assert.deepEqual(
    requests.map(({ path }) => path),
    [
      `/api/host/participations/7401/attend`,
      `/api/host/participations/7401/attend`,
      `/api/host/participations/7403/verify`,
      `/api/host/participations/7404/reject`,
      `/api/host/experiences/${experience.id}/promote-next`,
      `/api/host/experiences/${experience.id}`,
      `/api/host/experiences/${experience.id}/cancel`,
    ],
    "All host management actions should reach their expected API endpoints.",
  );
  assert.deepEqual(unexpectedApiRequests, [], "The screen should only request mocked host APIs.");
});

test("publishing an experience opens its host-management detail screen", async (t) => {
  const appUrl = getAppPreviewUrl("The publish handoff preview test");
  const appOrigin = new URL(appUrl).origin;

  const client = await launchBrowser(t);
  const { user } = makeFixtures();
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  let createBody;
  let createdExperience;
  const experienceId = 751;

  const hostOverview = () => ({
    organisation: user.organisation,
    upcomingExperiences: createdExperience ? 1 : 0,
    participantCount: 0,
    waitlistCount: 0,
    monthlyVerifiedCompletions: 0,
    pendingCompletionReviews: 0,
    pendingMilestoneReviews: 0,
    pendingVerifications: 0,
    totalExperiences: createdExperience ? 1 : 0,
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
        apiTraffic.push(`${method} ${url.pathname}`);
        if (method === "OPTIONS") {
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: [
              ...apiResponseHeaders(params.request, appOrigin),
              { name: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, OPTIONS" },
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
          response = createdExperience ? [createdExperience] : [];
        } else if (url.pathname === `/api/host/experiences/${experienceId}/participants` && method === "GET") {
          response = [];
        } else if (url.pathname === `/api/host/experiences/${experienceId}/milestones` && method === "GET") {
          response = { milestones: [], submissions: [], milestonesEditable: true };
        } else if (url.pathname === "/api/experiences" && method === "POST") {
          createBody = JSON.parse(params.request.postData ?? "{}");
          status = 201;
          createdExperience = {
            id: experienceId,
            organisation: user.organisation,
            title: createBody.title,
            description: createBody.description,
            category: createBody.category,
            date: createBody.date,
            startTime: createBody.startTime,
            endTime: createBody.endTime,
            location: createBody.location,
            city: createBody.city,
            capacity: createBody.capacity,
            participantCount: 0,
            availablePlaces: createBody.capacity,
            xpReward: createBody.xpReward,
            monetaryRewardPence: createBody.monetaryRewardPence,
            status: "published",
            waitlistCount: 0,
          };
          response = createdExperience;
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}`);
          status = 404;
          response = { message: "Unexpected API request in publish handoff test." };
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
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
    source: "localStorage.setItem('@experiences/auth-token', 'email_host-publish-test');",
  });
  await setViewport(client);
  await client.send("Page.navigate", { url: `${appUrl}/?screen=create` });

  const waitForPrompt = async (prompt) => waitForValue(
    client,
    `document.querySelector('[data-testid="create-question-heading"]')?.innerText?.trim() ?? ''`,
    (value) => value === prompt,
    `the create question "${prompt}"`,
  );
  const continueTo = async (prompt) => {
    await tapTestId(client, "create-primary");
    await waitForPrompt(prompt);
  };

  try {
    await waitForPrompt("Who is hosting?");
  } catch (error) {
    const browserState = await client.evaluate(`({
      url: location.href,
      text: document.body?.innerText?.slice(0, 1200) ?? "",
      question: document.querySelector('[data-testid="create-question-heading"]')?.innerText ?? null,
    })`);
    throw new Error(`${error.message} Browser state: ${JSON.stringify(browserState)}; API traffic: ${apiTraffic.join(", ")}; unexpected: ${unexpectedApiRequests.join(", ")}`);
  }
  await continueTo("What does your organisation do?");
  await continueTo("What should participants call it?");
  await replaceInput(client, "create-field-title", "Publish handoff test");
  await continueTo("What is the experience about?");
  await replaceInput(client, "create-field-description", "A browser-tested experience for the host handoff.");
  await continueTo("What kind of experience is it?");
  await tapTestId(client, "create-category-environmental");
  await continueTo("What day will it happen?");
  await tapTestId(client, "create-date-use-selected");
  await continueTo("What time does it start?");
  await tapTestId(client, "create-field-startTime-hour-value-11", {
    scrollIntoView: false,
    waitForStable: true,
    revealInScrollContainer: true,
  });
  await waitForStableValue(
    client,
    `document.querySelector('[data-testid="create-field-startTime"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label.endsWith("11:00"),
    "the selected 11:00 start time to settle",
  );
  await continueTo("When will it finish?");
  await tapTestId(client, "create-field-endTime-hour-value-12", {
    scrollIntoView: false,
    waitForStable: true,
    revealInScrollContainer: true,
  });
  await waitForStableValue(
    client,
    `document.querySelector('[data-testid="create-field-endTime"]')?.getAttribute('aria-label') ?? ''`,
    (label) => label.endsWith("12:00"),
    "the selected 12:00 end time to settle",
  );
  await continueTo("What city is it in?");
  await continueTo("Where will everyone meet?");
  await replaceInput(client, "create-field-location", "Community Garden");
  await continueTo("How many people can join?");
  await continueTo("How will you recognise participants?");
  await continueTo("What milestones will participants complete?");
  await replaceInput(client, "create-milestone-title-1", "Prepare the garden");
  await continueTo("Will you offer a cash reward?");
  await continueTo("What will participants do?");
  await continueTo("What should people bring?");
  await tapTestId(client, "create-primary");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the final experience review before publishing",
  );
  const publishButtonState = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="create-primary"]');
    return {
      disabled: Boolean(button?.disabled || button?.getAttribute('aria-disabled') === 'true'),
      review: document.body.innerText.slice(-1800),
    };
  })()`);
  assert.equal(
    publishButtonState.disabled,
    false,
    `The completed experience review should be publishable. Review state: ${JSON.stringify(publishButtonState.review)}`,
  );
  await tapTestId(client, "create-primary");

  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="host-edit-experience"]')) && document.body.innerText.includes('Publish handoff test')`,
    Boolean,
    "the newly published experience in host management",
  );
  assert.equal(createBody?.title, "Publish handoff test", "Publishing should send the experience details to the API.");
  assert.equal(createBody?.milestones?.[0]?.title, "Prepare the garden", "Publishing should preserve the configured milestone.");
  assert.ok(
    apiTraffic.includes(`GET /api/host/experiences/${experienceId}/participants`),
    "The host-management detail should load the new experience's participants.",
  );
  assert.ok(
    apiTraffic.includes(`GET /api/host/experiences/${experienceId}/milestones`),
    "The host-management detail should load the new experience's milestones.",
  );
  assert.deepEqual(unexpectedApiRequests, [], "The publish and handoff flow should only request mocked APIs.");
});

test("organisations can start setup for another Telegram community", async (t) => {
  const appUrl = getAppPreviewUrl("The Telegram community add preview test");
  const appOrigin = new URL(appUrl).origin;
  const client = await launchBrowser(t);
  const { user } = makeFixtures();
  const community = {
    chatId: "-100123456789",
    chatTitle: "EXP’s Private Beta Phase",
    organisationName: user.organisation.name,
    spamProtectionEnabled: true,
    xpAwardedToday: 65,
    dailyXpLimit: 1000,
    dailyXpRemaining: 935,
    memberXpLimit: 2000,
    totalXpAwarded: 650,
    membersWithXp: 12,
    xpEarnersToday: 4,
    trackedMembers: 20,
    qualifyingMessagesToday: 30,
    resetTimezone: "UTC",
  };
  const apiTraffic = [];
  const phraseRules = [];
  const linkRules = [];
  const submittedRuleRequests = [];
  let nextRuleId = 7001;

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
              ...apiResponseHeaders(params.request, appOrigin),
                { name: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
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
        let response = {};
        if (url.pathname === "/api/me" && method === "GET") {
          response = user;
        } else if (url.pathname === "/api/community/manage" && method === "GET") {
          response = { communities: [community] };
        } else if (url.pathname === `/api/community/manage/${community.chatId}/rules` && method === "GET") {
          response = { phraseRules, linkRules };
        } else if (url.pathname === `/api/community/manage/${community.chatId}/rules/phrases` && method === "POST") {
          const body = JSON.parse(params.request.postData ?? "{}");
          submittedRuleRequests.push({ method, path: url.pathname, body });
          const rule = { id: nextRuleId++, phrase: body.phrase, createdAt: "2026-10-24T12:00:00.000Z" };
          phraseRules.push(rule);
          status = 201;
          response = rule;
        } else if (url.pathname === `/api/community/manage/${community.chatId}/rules/links` && method === "POST") {
          const body = JSON.parse(params.request.postData ?? "{}");
          submittedRuleRequests.push({ method, path: url.pathname, body });
          const rawLink = body.link.trim();
          const link = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
          const rule = { id: nextRuleId++, link, createdAt: "2026-10-24T12:00:00.000Z" };
          linkRules.push(rule);
          status = 201;
          response = rule;
        } else if (/\/rules\/phrases\/\d+$/.test(url.pathname) && method === "DELETE") {
          submittedRuleRequests.push({ method, path: url.pathname });
          const ruleId = Number(url.pathname.split("/").at(-1));
          const index = phraseRules.findIndex((rule) => rule.id === ruleId);
          if (index >= 0) phraseRules.splice(index, 1);
          status = 204;
        } else if (/\/rules\/links\/\d+$/.test(url.pathname) && method === "DELETE") {
          submittedRuleRequests.push({ method, path: url.pathname });
          const ruleId = Number(url.pathname.split("/").at(-1));
          const index = linkRules.findIndex((rule) => rule.id === ruleId);
          if (index >= 0) linkRules.splice(index, 1);
          status = 204;
        } else if (url.pathname === "/api/friends" && method === "GET") {
          response = [];
        } else if (url.pathname === "/api/friends/notifications" && method === "GET") {
          response = { notifications: [], unreadCount: 0 };
        } else if (url.pathname === "/api/organisations/verification" && method === "GET") {
          response = { status: "unsubmitted" };
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
          body: status === 204 ? "" : Buffer.from(JSON.stringify(response)).toString("base64"),
        });
      } catch {
        await client.send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "Failed",
        }).catch(() => {});
      }
    })();
  });

  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "localStorage.setItem('@experiences/auth-token', 'email_telegram-community-test'); window.__telegramShareLinks = []; window.Telegram = { WebApp: { openTelegramLink: (url) => window.__telegramShareLinks.push(url) } };",
  });
  await setViewport(client);
  await client.send("Page.navigate", { url: `${appUrl}/?screen=telegram-communities` });

  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="telegram-community--100123456789"]')) && Boolean(document.querySelector('[data-testid="telegram-community-add"]'))`,
    Boolean,
    "the linked Telegram group and its add-community action",
  );
  const addCommunityPlacement = await client.evaluate(`(() => {
    const group = document.querySelector('[data-testid="telegram-community--100123456789"]')?.getBoundingClientRect();
    const add = document.querySelector('[data-testid="telegram-community-add"]')?.getBoundingClientRect();
    return group && add ? { groupBottom: group.bottom, addTop: add.top } : null;
  })()`);
  assert.ok(
    addCommunityPlacement && addCommunityPlacement.addTop >= addCommunityPlacement.groupBottom,
    `The add-community action should appear below the linked group. Bounds: ${JSON.stringify(addCommunityPlacement)}`,
  );

  await tapTestId(client, "telegram-community--100123456789");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="telegram-community-dashboard-screen"]')) && Boolean(document.querySelector('[data-testid="telegram-community-phrase-input"]'))`,
    Boolean,
    "the linked group's phrase and link rule editors",
  );
  await waitForValue(
    client,
    `document.body.innerText.includes('Unlisted links won’t be removed until you add one.')`,
    Boolean,
    "the safe empty-whitelist state",
  );

  await replaceInput(client, "telegram-community-phrase-input", "unlisted phrase");
  await tapTestId(client, "telegram-community-phrase-add");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="telegram-community-phrase-remove-7001"]'))`,
    Boolean,
    "the newly saved banned phrase",
  );

  await replaceInput(client, "telegram-community-link-input", "trusted.example.org/resources");
  await tapTestId(client, "telegram-community-link-add");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="telegram-community-link-remove-7002"]'))`,
    Boolean,
    "the newly saved whitelisted link",
  );

  await tapTestId(client, "telegram-community-phrase-remove-7001");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="telegram-community-phrase-remove-7001"]')`,
    Boolean,
    "the banned phrase to be removed",
  );
  await tapTestId(client, "telegram-community-link-remove-7002");
  await waitForValue(
    client,
    `!document.querySelector('[data-testid="telegram-community-link-remove-7002"]')`,
    Boolean,
    "the whitelisted link to be removed",
  );

  assert.deepEqual(
    submittedRuleRequests.filter((request) => request.method === "POST").map((request) => request.body),
    [{ phrase: "unlisted phrase" }, { link: "trusted.example.org/resources" }],
    "The editors should submit the exact phrase and URL entered by the organisation owner.",
  );
  assert.ok(
    submittedRuleRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/phrases/7001")),
    "The dashboard should send a phrase-delete request.",
  );
  assert.ok(
    submittedRuleRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/links/7002")),
    "The dashboard should send a link-delete request.",
  );
  await tapTestId(client, "telegram-community-dashboard-back");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="telegram-community-add"]'))`,
    Boolean,
    "the linked group list after leaving its dashboard",
  );

  await tapTestId(client, "telegram-community-add");
  const addCommunityLaunch = await client.evaluate(`window.__telegramShareLinks?.at(-1) ?? ''`);
  assert.equal(
    new URL(addCommunityLaunch).searchParams.get("start"),
    "community",
    "Add community should launch the existing Telegram group setup flow.",
  );
  assert.ok(apiTraffic.includes("GET /api/community/manage"), "The screen should load the organisation’s linked groups.");
});

test("charity treasury dashboard shows live values and supports private balance and copy controls", async (t) => {
  const appBaseUrl = process.env.HOST_MANAGEMENT_APP_URL ?? getAppPreviewUrl("The charity treasury dashboard preview test");
  const appOrigin = new URL(appBaseUrl).origin;
  const client = await launchBrowser(t);
  const { user: fixtureUser } = makeFixtures();
  const user = {
    ...fixtureUser,
    organisation: { ...fixtureUser.organisation, type: "charity" },
  };
  const walletAddress = "7YWHMfk9JZe0LM0g1Z8cL3cQW4zVg2oJx7kVhV9zT4x8";
  const treasuryDashboard = {
    treasury: {
      organisationId: user.organisation.id,
      organisationUserId: user.id,
      walletAddress,
      cluster: "devnet",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    },
    balanceSol: "12.34",
    transactions: [],
    nextCursor: null,
    hasMore: false,
    checkedAt: "2026-10-24T10:00:00.000Z",
  };
  const apiTraffic = [];
  const unexpectedApiRequests = [];

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
        let response = {};
        if (url.pathname === "/api/me" && method === "GET") {
          response = user;
        } else if (url.pathname === "/api/friends" && method === "GET") {
          response = [];
        } else if (url.pathname === "/api/friends/notifications" && method === "GET") {
          response = { notifications: [], unreadCount: 0 };
        } else if (url.pathname === "/api/organisations/verification" && method === "GET") {
          response = { status: "unsubmitted" };
        } else if (url.pathname === "/api/host/overview" && method === "GET") {
          response = {
            organisation: user.organisation,
            upcomingExperiences: 0,
            participantCount: 0,
            waitlistCount: 0,
            monthlyVerifiedCompletions: 0,
            pendingVerifications: 0,
            pendingCompletionReviews: 0,
            pendingMilestoneReviews: 0,
            totalExperiences: 0,
          };
        } else if (url.pathname === "/api/funds/treasury" && method === "GET") {
          response = treasuryDashboard;
        } else if (url.pathname === `/api/funds/${user.id}` && method === "GET") {
          response = [];
        } else if (
          (url.pathname === "/api/funds/payouts" || url.pathname === "/api/funds/payout-candidates")
          && method === "GET"
        ) {
          response = [];
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}`);
          status = 404;
          response = { message: "Unexpected API request in charity treasury test." };
        }

        await client.send("Fetch.fulfillRequest", {
          requestId: params.requestId,
          responseCode: status,
          responseHeaders: apiResponseHeaders(params.request, appOrigin),
          body: status === 204 ? "" : Buffer.from(JSON.stringify(response)).toString("base64"),
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
    source: `localStorage.setItem('@experiences/auth-token', 'email_treasury-visual-test'); window.__treasuryClipboard = ''; window.__treasuryAlerts = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__treasuryClipboard = text; }, readText: async () => window.__treasuryClipboard } }); window.alert = (message) => window.__treasuryAlerts.push(String(message));`,
  });
  await setViewport(client);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 402,
    height: 874,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.navigate", { url: `${appBaseUrl}/?screen=funds` });

  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="treasury-hero-card"]')) && Boolean(document.querySelector('[data-testid="treasury-hero-artwork"]')) && Boolean(document.querySelector('[data-testid="treasury-empty-activity"]')) && Boolean(document.querySelector('[data-testid="treasury-empty-artwork"]'))`,
    Boolean,
    "the charity treasury card and its empty activity artwork",
  );
  const dashboardText = await client.evaluate(`document.body?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`);
  assert.ok(dashboardText.includes("Charity treasury"), "The screen should show the charity treasury heading.");
  assert.ok(dashboardText.includes("No incoming transfers yet"), "The screen should explain the empty treasury activity state.");
  assert.ok(dashboardText.includes("Solana · devnet"), "The network chip should reflect the registered treasury network.");
  assert.ok(dashboardText.includes("12.34 SOL"), "The balance should come from the treasury response.");
  assert.ok(dashboardText.includes("Community impact"), "The screen should retain the organisation impact metrics.");
  const impactLayout = await client.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-testid^="treasury-metric-"]')];
    const nav = document.querySelector('[data-testid="bottom-nav-tabs"]');
    return {
      cardCount: cards.length,
      cardsBottom: cards.length ? Math.max(...cards.map((card) => card.getBoundingClientRect().bottom)) : null,
      navTop: nav?.getBoundingClientRect().top ?? null,
    };
  })()`);
  assert.equal(impactLayout.cardCount, 4, "All four community impact cards should be present.");
  assert.ok(
    impactLayout.cardsBottom !== null && impactLayout.navTop !== null && impactLayout.cardsBottom <= impactLayout.navTop,
    `The impact cards should remain above the bottom navigation at phone size. Bounds: ${JSON.stringify(impactLayout)}`,
  );

  if (process.env.ORGANISATION_TREASURY_SCREENSHOT_PATH) {
    await client.evaluate(`document.querySelector('[data-testid="treasury-empty-activity"]')?.scrollIntoView({ block: "center" })`);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(
      process.env.ORGANISATION_TREASURY_SCREENSHOT_PATH,
      Buffer.from(screenshot.data, "base64"),
    );
  }

  await tapTestId(client, "treasury-balance-visibility");
  await waitForValue(
    client,
    `document.querySelector('[data-testid="treasury-hero-card"]')?.innerText?.includes('••••••••') ?? false`,
    Boolean,
    "the treasury balance to hide when requested",
  );
  await tapTestId(client, "treasury-address-copy");
  await waitForValue(
    client,
    `window.__treasuryClipboard === ${JSON.stringify(walletAddress)}`,
    Boolean,
    "the treasury address to be copied",
  );
  assert.deepEqual(unexpectedApiRequests, [], "The dashboard should only call the read-only APIs needed by the screen.");
  assert.ok(apiTraffic.includes("GET /api/funds/treasury"), "The dashboard should load the registered charity treasury.");
});