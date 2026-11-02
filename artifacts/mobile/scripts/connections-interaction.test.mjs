import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const viewport = { width: 390, height: 740 };
const sessionToken = "email_connections-interaction-test";
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
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-connections-test-"));
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
  assert.ok(point.visible, `Expected "${testId}" to be visible. Geometry: ${JSON.stringify(point)}`);
  assert.ok(!point.disabled, `Expected "${testId}" to be enabled.`);
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

async function tapLabel(client, label) {
  const selector = JSON.stringify(`[aria-label="${label}"]`);
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
  assert.ok(point, `Expected accessible control "${label}" to be present.`);
  assert.ok(point.visible, `Expected "${label}" to be visible. Geometry: ${JSON.stringify(point)}`);
  assert.ok(!point.disabled, `Expected "${label}" to be enabled.`);
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

const friends = Array.from({ length: 5 }, (_, index) => ({
  id: 700 + index,
  name: `Connection Friend ${index + 1}`,
  username: `connection_friend_${index + 1}`,
  avatarUrl: null,
  city: "London",
  userType: "participant",
}));

function makeRequest(id, name, username) {
  return {
    id,
    user: { id: 800 + id, name, username, avatarUrl: null },
    status: "pending",
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

function makePartnership(id, name, username, direction, status = "pending") {
  return {
    id,
    partner: { id: 900 + id, name, username, avatarUrl: null },
    status,
    direction,
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

async function runConnectionsScenario(t, userType) {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the Connections preview test.");
  const client = await launchBrowser(t);
  const user = {
    id: userType === "participant" ? 690 : 691,
    createdAt: "2026-01-01T00:00:00.000Z",
    telegramId: null,
    email: `connections-${userType}@example.test`,
    name: userType === "participant" ? "Connections Participant" : "Connections Organisation",
    username: `connections_${userType}`,
    avatarUrl: null,
    bio: "An authenticated Connections interaction test profile.",
    city: "London",
    country: "UK",
    socialLinks: {},
    interests: ["environmental"],
    participationType: null,
    userType,
    organisation: userType === "organisation"
      ? { type: "charity", name: "Connections Test Organisation", description: "A test organisation.", city: "London", country: "UK", categories: ["environmental"], verified: true }
      : null,
    xp: 320,
    level: "Explorer",
    completedCount: 2,
    hostedCount: userType === "organisation" ? 1 : 0,
    rewardsPence: 0,
  };
  let friendRequests = [
    makeRequest(801, "Incoming Friend One", "incoming_one"),
    makeRequest(802, "Incoming Friend Two", "incoming_two"),
  ];
  let sentRequests = [makeRequest(803, "Sent Friend", "sent_friend")];
  let pinnedFriends = [friends[0]];
  let partnershipItems = userType === "organisation"
    ? [
        makePartnership(901, "Partner Request One", "partner_one", "incoming"),
        makePartnership(902, "Partner Request Two", "partner_two", "incoming"),
        makePartnership(903, "Active Partner", "active_partner", "outgoing", "active"),
      ]
    : [];
  const apiTraffic = [];
  const unexpectedApiRequests = [];
  const browserErrors = [];
  const friendRequestActions = [];
  const partnershipActions = [];
  const pinUpdates = [];
  let chatRecipientId = null;
  let conversation;
  let interceptionError;

  client.on("Runtime.exceptionThrown", ({ params }) => {
    browserErrors.push(params.exceptionDetails?.text ?? "Browser runtime exception.");
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
              ...apiResponseHeaders(params.request, domain),
              { name: "Access-Control-Allow-Methods", value: "GET, POST, PUT, OPTIONS" },
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

        const body = params.request.postData ? JSON.parse(params.request.postData) : {};
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
        } else if (url.pathname === "/api/me/xp-awards" && method === "GET") {
          response = { balanceXp: 0, pendingXp: 0, awards: [] };
        } else if (url.pathname === "/api/friends" && method === "GET") {
          response = friends;
        } else if (url.pathname === "/api/friends/top" && method === "GET") {
          response = pinnedFriends;
        } else if (url.pathname === "/api/friends/top" && method === "PUT") {
          pinUpdates.push(body.friendIds);
          pinnedFriends = body.friendIds.map((friendId) => friends.find((friend) => friend.id === friendId));
          response = pinnedFriends;
        } else if (url.pathname === "/api/friends/requests" && method === "GET") {
          response = friendRequests;
        } else if (url.pathname === "/api/friends/requests/sent" && method === "GET") {
          response = sentRequests;
        } else if (url.pathname === "/api/friends/requests" && method === "POST") {
          const request = makeRequest(804, "New Friend Request", body.username);
          sentRequests = [...sentRequests, request];
          response = request;
          status = 201;
        } else if (/^\/api\/friends\/requests\/\d+\/(accept|decline)$/.test(url.pathname) && method === "POST") {
          const [, rawId, action] = url.pathname.match(/\/(\d+)\/(accept|decline)$/);
          const requestId = Number(rawId);
          friendRequestActions.push({ requestId, action });
          friendRequests = friendRequests.filter((request) => request.id !== requestId);
          response = { id: requestId, status: action === "accept" ? "accepted" : "declined" };
        } else if (url.pathname === "/api/direct-messages/conversations" && method === "POST") {
          chatRecipientId = body.recipientId;
          conversation = {
            id: 990,
            otherUser: {
              id: chatRecipientId,
              name: friends.find((friend) => friend.id === chatRecipientId)?.name ?? "Unknown friend",
              username: friends.find((friend) => friend.id === chatRecipientId)?.username ?? null,
              avatarUrl: null,
            },
            lastMessage: null,
            lastMessageAt: null,
            unreadCount: 0,
          };
          response = conversation;
        } else if (url.pathname === "/api/direct-messages/conversations" && method === "GET") {
          response = conversation ? [conversation] : [];
        } else if (url.pathname === "/api/direct-messages/conversations/990" && method === "GET") {
          response = conversation;
        } else if (url.pathname === "/api/direct-messages/messages" && method === "GET") {
          response = { messages: [], hasMore: false };
        } else if (url.pathname === "/api/organisation-partnerships" && method === "GET") {
          response = partnershipItems;
        } else if (/^\/api\/organisation-partnerships\/\d+\/(accept|decline)$/.test(url.pathname) && method === "POST") {
          const [, rawId, action] = url.pathname.match(/\/(\d+)\/(accept|decline)$/);
          const partnershipId = Number(rawId);
          partnershipActions.push({ partnershipId, action });
          partnershipItems = partnershipItems.filter((item) => item.id !== partnershipId);
          response = { id: partnershipId, status: action === "accept" ? "active" : "declined" };
        } else if (url.pathname.endsWith("/analytics/events") && method === "POST") {
          status = 202;
          response = { accepted: true };
        } else {
          unexpectedApiRequests.push(`${method} ${url.pathname}${url.search}`);
          status = 404;
          response = { message: "Unexpected API request in Connections test." };
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
  await client.send("Page.navigate", { url: `https://${domain}/?screen=friends` });

  try {
    await waitForValue(
      client,
      `document.querySelector('[data-testid="friends-profile-${friends[0].id}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text.includes(friends[0].name),
      `the signed-in ${userType} profile's My Circle list`,
    );
    const initialCircle = await client.evaluate(`(() => ({
      friendCount: document.querySelectorAll('[data-testid^="friends-profile-"]').length,
      seeAll: document.querySelector('[data-testid="friends-see-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
      topFriend: document.querySelector('[data-testid="friends-top-friend-${friends[0].id}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
      requestsSummary: document.querySelector('[data-testid="friends-request-summary"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? null,
    }))()`);
    assert.equal(initialCircle.friendCount, 3, "My Circle should initially show only three friends.");
    assert.ok(initialCircle.seeAll?.startsWith("See all"), "The collapsed friend list should offer See all.");
    assert.ok(initialCircle.topFriend?.includes(friends[0].name), "The existing pinned friend should appear in My Top Friends.");
    assert.ok(initialCircle.requestsSummary?.includes("3 requests to review"), "My Circle should summarize incoming and sent requests.");

    await tapTestId(client, "friends-see-all");
    await waitForValue(
      client,
      `document.querySelectorAll('[data-testid^="friends-profile-"]').length`,
      (count) => count === friends.length,
      "all friends to appear after selecting See all",
    );
    assert.ok(
      (await client.evaluate(`document.querySelector('[data-testid="friends-see-all"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`)).startsWith("Show less"),
      "The expanded friend list should offer Show less.",
    );
    await tapTestId(client, `friends-pin-${friends[3].id}`);
    await waitForValue(
      client,
      `document.querySelector('[data-testid="friends-top-friend-${friends[3].id}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text.includes(friends[3].name),
      "the selected friend to appear in My Top Friends",
    );
    await tapTestId(client, "friends-see-all");
    await waitForValue(
      client,
      `document.querySelectorAll('[data-testid^="friends-profile-"]').length`,
      (count) => count === 3,
      "the friend list to collapse after selecting Show less",
    );
    assert.ok(pinUpdates.some((ids) => ids.includes(friends[3].id)), "Pinning should persist the chosen friend.");

    await tapTestId(client, "connections-tab-requests");
    await waitForValue(
      client,
      `document.querySelector('[data-testid="friends-request-incoming-801"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
      (text) => text.includes("Incoming Friend One"),
      "incoming friend requests in the Requests tab",
    );
    assert.ok(
      await client.evaluate(`document.querySelector('[data-testid="friends-request-sent-803"]')?.innerText?.includes("Sent Friend") ?? false`),
      "The Requests tab should include sent friend requests.",
    );
    assert.equal(
      await client.evaluate(`Boolean(document.querySelector('[data-testid="organisation-partnerships"]'))`),
      userType === "organisation",
      "Organisation partnerships should only appear for organisation profiles.",
    );
    if (userType === "organisation") {
      await waitForValue(
        client,
        `document.querySelector('[data-testid="organisation-partnership-incoming-901"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
        (text) => text.includes("Partner Request One"),
        "incoming organisation partnership requests",
      );
      assert.ok(
        await client.evaluate(`Boolean([...document.querySelectorAll('[aria-label]')].find((element) => element.getAttribute('aria-label') === 'Accept partnership request from Partner Request One'))`),
        "Organisation requests should have an Accept action.",
      );
      assert.ok(
        await client.evaluate(`Boolean([...document.querySelectorAll('[aria-label]')].find((element) => element.getAttribute('aria-label') === 'Decline partnership request from Partner Request Two'))`),
        "Organisation requests should have a Decline action.",
      );
      await tapLabel(client, "Accept partnership request from Partner Request One");
      await waitForValue(
        client,
        `Boolean(document.querySelector('[data-testid="organisation-partnership-incoming-901"]'))`,
        (visible) => !visible,
        "the accepted organisation partnership request to leave the incoming list",
      );
      await tapLabel(client, "Decline partnership request from Partner Request Two");
      await waitForValue(
        client,
        `Boolean(document.querySelector('[data-testid="organisation-partnership-incoming-902"]'))`,
        (visible) => !visible,
        "the declined organisation partnership request to leave the incoming list",
      );
    }
    await tapLabel(client, "Accept Incoming Friend One's friend request");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="friends-request-incoming-801"]'))`,
      (visible) => !visible,
      "the accepted friend request to leave the Requests tab",
    );
    await tapLabel(client, "Decline Incoming Friend Two's friend request");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="friends-request-incoming-802"]'))`,
      (visible) => !visible,
      "the declined friend request to leave the Requests tab",
    );
    assert.ok(
      await client.evaluate(`Boolean(document.querySelector('[data-testid="friends-request-sent-803"]'))`),
      "Responding to incoming requests should not remove sent requests.",
    );

    await tapTestId(client, "connections-tab-people");
    await waitForValue(
      client,
      `document.querySelector('[data-testid="friends-add-username"]')?.getAttribute("placeholder") ?? ''`,
      (placeholder) => placeholder === "username",
      "the Add a friend action in Find People",
    );
    await client.evaluate(`(() => {
      const input = document.querySelector('[data-testid="friends-add-username"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "new_connection");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await tapTestId(client, "friends-send-request");
    await waitForValue(
      client,
      `document.body.innerText.includes("Friend request sent.")`,
      Boolean,
      "a friend request to be sent from Find People",
    );

    await tapTestId(client, "connections-tab-circle");
    await tapTestId(client, "friends-see-all");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="friends-chat-${friends[3].id}"]'))`,
      Boolean,
      "the direct-message shortcut to appear on a friend row",
    );
    const pinStillShown = await client.evaluate(
      `document.querySelector('[data-testid="friends-top-friend-${friends[3].id}"]')?.innerText?.replace(/\\s+/g, ' ').trim() ?? ''`,
    );
    assert.ok(pinStillShown.includes(friends[3].name), "Opening other tabs should not discard the pinned friend.");
    await tapTestId(client, `friends-chat-${friends[3].id}`);
    await waitForValue(
      client,
      `document.body.innerText.includes("Say hello to ${friends[3].name}.")`,
      Boolean,
      "a direct conversation with the selected friend to open",
    );
    assert.equal(chatRecipientId, friends[3].id, "The chat shortcut should create a conversation with the row's friend.");
    assert.ok(friendRequestActions.some(({ requestId, action }) => requestId === 801 && action === "accept"));
    assert.ok(friendRequestActions.some(({ requestId, action }) => requestId === 802 && action === "decline"));
    assert.ok(
      apiTraffic.some((request) => request === "POST /api/friends/requests"),
      "Find People should submit its friend request through the signed-in API.",
    );
    if (userType === "organisation") {
      assert.deepEqual(partnershipActions, [
        { partnershipId: 901, action: "accept" },
        { partnershipId: 902, action: "decline" },
      ]);
    } else {
      assert.deepEqual(partnershipActions, []);
    }
    await delay(100);
    assert.equal(interceptionError, undefined, `API interception should complete cleanly: ${interceptionError?.message}`);
    assert.deepEqual(unexpectedApiRequests, [], `All API calls should be handled: ${unexpectedApiRequests.join(", ")}`);
  } catch (error) {
    const browserState = await client.evaluate(`(() => ({
      url: location.href,
      title: document.title,
      body: document.body?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 1000) ?? '',
    }))()`).catch((diagnosticError) => ({ diagnosticError: diagnosticError.message }));
    throw new Error(
      `${error.message}\nProfile type: ${userType}\nBrowser state: ${JSON.stringify(browserState)}\nBrowser errors: ${JSON.stringify(browserErrors)}\nAPI traffic: ${JSON.stringify(apiTraffic)}\nUnexpected: ${JSON.stringify(unexpectedApiRequests)}`,
    );
  }
}

test("signed-in participant and organisation Connections tabs, actions, expansion, and chat shortcut work on mobile", async (t) => {
  await t.test("participant profile", async (participantTest) => {
    await runConnectionsScenario(participantTest, "participant");
  });
  await t.test("organisation profile", async (organisationTest) => {
    await runConnectionsScenario(organisationTest, "organisation");
  });
});
