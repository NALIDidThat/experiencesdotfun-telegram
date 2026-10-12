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
      for (const listener of client.#listeners.get(message.method) ?? []) {
        listener(message);
      }
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

async function waitForFile(path, process) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Chromium exited before creating ${path}.`);
    try {
      return await readFile(path, "utf8");
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for Chromium to create ${path}.`);
}

async function launchBrowser(t) {
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-email-auth-test-"));
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
    const activePortContents = await waitForFile(join(profileDir, "DevToolsActivePort"), chromium);
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

async function setViewport(client, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function tapTestId(client, testId) {
  const selector = JSON.stringify(`[data-testid="${testId}"]`);
  const point = await client.evaluate(`(() => {
    const element = document.querySelector(${selector});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      visible: rect.width > 0 && rect.height > 0
        && rect.top >= 0
        && rect.bottom <= (window.visualViewport?.height ?? window.innerHeight),
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
    };
  })()`);
  assert.ok(point, `Expected control "${testId}" to be present.`);
  assert.ok(point.visible, `Expected control "${testId}" to be visible in the viewport.`);
  assert.ok(!point.disabled, `Expected control "${testId}" to be enabled.`);
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

async function enterText(client, testId, value) {
  await tapTestId(client, testId);
  await client.send("Input.insertText", { text: value });
  const selector = JSON.stringify(`[data-testid="${testId}"]`);
  await waitForValue(
    client,
    `document.querySelector(${selector})?.value ?? null`,
    (current) => current === value,
    `text to appear in "${testId}"`,
  );
}

async function getRequestBody(client, params) {
  const postData = params.request.postData
    ?? (params.request.hasPostData
      ? (await client.send("Fetch.getRequestPostData", { requestId: params.requestId })).postData
      : undefined);
  return JSON.parse(postData ?? "{}");
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

async function assertLoginIdentifierRequest(t, identifier, expectedInput) {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile email auth flow test.");

  const client = await launchBrowser(t);
  const requests = [];
  let interceptionError;

  client.on("Fetch.requestPaused", ({ params }) => {
    void (async () => {
      try {
        const url = new URL(params.request.url);
        if (
          params.request.method === "OPTIONS"
          && url.pathname.startsWith("/api/auth/email/")
        ) {
          const origin = params.request.headers.Origin ?? `https://${domain}`;
          const requestedHeaders = params.request.headers["Access-Control-Request-Headers"]
            ?? params.request.headers["access-control-request-headers"]
            ?? "authorization,content-type";
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: [
              { name: "Access-Control-Allow-Origin", value: origin },
              { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
              { name: "Access-Control-Allow-Headers", value: requestedHeaders },
            ],
            body: "",
          });
          return;
        }

        if (url.pathname.endsWith("/api/auth/email/login") && params.request.method === "POST") {
          requests.push(await getRequestBody(client, params));
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 401,
            responseHeaders: apiResponseHeaders(params.request, domain),
            body: Buffer.from(JSON.stringify({
              message: "That email, username or password is not correct.",
            })).toString("base64"),
          });
          return;
        }

        if (url.pathname.startsWith("/api/")) {
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: url.pathname.endsWith("/analytics/events") ? 202 : 200,
            responseHeaders: apiResponseHeaders(params.request, domain),
            body: Buffer.from(JSON.stringify(
              url.pathname.endsWith("/analytics/events") ? { accepted: true } : [],
            )).toString("base64"),
          });
          return;
        }

        await client.send("Fetch.continueRequest", { requestId: params.requestId });
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
  await setViewport(client, viewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/` });
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="welcome-start"]'))`,
    Boolean,
    "the signed-out welcome screen",
  );
  await tapTestId(client, "welcome-start");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="account-type-participant"]'))`,
    Boolean,
    "the account type choices",
  );
  await tapTestId(client, "account-type-participant");
  await tapTestId(client, "account-type-continue");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="login-choice-email"]'))`,
    Boolean,
    "the sign-in method choices",
  );
  await tapTestId(client, "login-choice-email");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="email-login-identifier"]'))`,
    Boolean,
    "the email-account sign-in form",
  );

  await enterText(client, "email-login-identifier", identifier);
  await enterText(client, "email-login-password", "LocalTestPass123!");
  await tapTestId(client, "email-auth-submit");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="email-auth-error"]'))`,
    Boolean,
    "the mocked login response",
  );

  assert.ifError(interceptionError);
  assert.deepEqual(requests, [expectedInput]);
}

test("signup creates an authenticated session without production data", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile email auth flow test.");

  const client = await launchBrowser(t);
  const requests = [];
  let interceptionError;
  let signupUser;

  client.on("Fetch.requestPaused", ({ params }) => {
    void (async () => {
      try {
        const url = new URL(params.request.url);
        if (
          params.request.method === "OPTIONS"
          && url.pathname.startsWith("/api/auth/email/")
        ) {
          const origin = params.request.headers.Origin ?? `https://${domain}`;
          const requestedHeaders = params.request.headers["Access-Control-Request-Headers"]
            ?? params.request.headers["access-control-request-headers"]
            ?? "authorization,content-type";
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: [
              { name: "Access-Control-Allow-Origin", value: origin },
              { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
              { name: "Access-Control-Allow-Headers", value: requestedHeaders },
            ],
            body: "",
          });
          return;
        }
        if (url.pathname.endsWith("/api/auth/email/signup")) {
          if (params.request.method !== "POST") {
            await client.send("Fetch.continueRequest", { requestId: params.requestId });
            return;
          }
          const input = await getRequestBody(client, params);
          assert.equal(input.email, "signup.flow@example.test", `Unexpected signup body: ${JSON.stringify(input)}`);
          assert.equal(input.password, "LocalTestPass123!", `Unexpected signup body: ${JSON.stringify(input)}`);
          assert.equal(input.userType, "participant", `Unexpected signup body: ${JSON.stringify(input)}`);
          signupUser = {
            id: 456,
            createdAt: "2026-01-01T00:00:00.000Z",
            telegramId: null,
            email: input.email,
            name: input.name,
            username: input.username,
            avatarUrl: null,
            bio: null,
            city: "Test City",
            country: null,
            interests: ["environment"],
            socialLinks: {},
            participationType: null,
            userType: "participant",
            organisation: null,
            xp: 0,
            level: "Explorer",
            completedCount: 0,
            hostedCount: 0,
            rewardsPence: 0,
          };
          requests.push({ path: url.pathname, input });
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: apiResponseHeaders(params.request, domain),
            body: Buffer.from(JSON.stringify({
              user: signupUser,
              isNew: true,
              sessionToken: "email_signup-test-session",
            })).toString("base64"),
          });
          return;
        }

        if (url.pathname.endsWith("/api/auth/email/login")) {
          if (params.request.method !== "POST") {
            await client.send("Fetch.continueRequest", { requestId: params.requestId });
            return;
          }
          const input = await getRequestBody(client, params);
          assert.equal(input.email, "signup.flow@example.test");
          assert.equal(input.password, "LocalTestPass123!");
          requests.push({ path: url.pathname, input });
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: apiResponseHeaders(params.request, domain),
            body: Buffer.from(JSON.stringify({
              user: signupUser,
              isNew: false,
              sessionToken: "email_local-test-session",
            })).toString("base64"),
          });
          return;
        }

        if (url.pathname.startsWith("/api/")) {
          await client.send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: url.pathname.endsWith("/analytics/events") ? 202 : 200,
            responseHeaders: apiResponseHeaders(params.request, domain),
            body: Buffer.from(JSON.stringify(
              url.pathname.endsWith("/analytics/events") ? { accepted: true } : [],
            )).toString("base64"),
          });
          return;
        }

        await client.send("Fetch.continueRequest", { requestId: params.requestId });
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
  await setViewport(client, viewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/` });
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="welcome-start"]'))`,
    Boolean,
    "the signed-out welcome screen",
  );

  await tapTestId(client, "welcome-start");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="account-type-participant"]'))`,
    Boolean,
    "the account type choices",
  );
  await tapTestId(client, "account-type-participant");
  await tapTestId(client, "account-type-continue");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="login-choice-email"]'))`,
    Boolean,
    "the sign-in method choices",
  );
  await tapTestId(client, "login-choice-email");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="email-auth-mode-switch"]'))`,
    Boolean,
    "the email sign-in form",
  );
  await tapTestId(client, "email-auth-mode-switch");

  const signupFields = [
    ["email-signup-name", "Signup QA"],
    ["email-signup-email", "signup.flow@example.test"],
    ["email-signup-password", "LocalTestPass123!"],
    ["email-signup-confirm-password", "LocalTestPass123!"],
    ["email-signup-username", "signup_qa"],
  ];
  for (let index = 0; index < signupFields.length; index += 1) {
    const [testId, value] = signupFields[index];
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="${testId}"]'))`,
      Boolean,
      `signup field ${index + 1}`,
    );
    await enterText(client, testId, value);
    if (index < signupFields.length - 1) await tapTestId(client, "email-auth-submit");
  }
  await tapTestId(client, "email-auth-submit");

  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="signup-congratulations"]'))`,
    Boolean,
    "the signed-in signup congratulations screen",
  );
  assert.ifError(interceptionError);
  assert.equal(
    requests.filter(({ path }) => path.endsWith("/signup")).length,
    1,
    `Expected one intercepted signup request; received ${JSON.stringify(requests)}.`,
  );
  assert.equal(requests[0].input.email, "signup.flow@example.test");
  assert.equal(requests[0].input.username, "signup_qa");
});

test("email login keeps sending the existing email credential shape", async (t) => {
  await assertLoginIdentifierRequest(t, "signup.flow@example.test", {
    email: "signup.flow@example.test",
    password: "LocalTestPass123!",
  });
});

test("login accepts an @-prefixed username", async (t) => {
  await assertLoginIdentifierRequest(t, "@Signup_QA", {
    username: "signup_qa",
    password: "LocalTestPass123!",
  });
});

test("organisation signup requires a supported subtype before sign-in", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile organisation flow test.");

  const client = await launchBrowser(t);
  await setViewport(client, viewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/` });
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="welcome-start"]'))`,
    Boolean,
    "the signed-out welcome screen",
  );

  await tapTestId(client, "welcome-start");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="account-type-organisation"]'))`,
    Boolean,
    "the account type choices",
  );
  await tapTestId(client, "account-type-organisation");
  await tapTestId(client, "account-type-continue");

  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="organisation-type-selection"]'))`,
    Boolean,
    "the organisation subtype choices",
  );
  const initialState = await client.evaluate(`(() => ({
    cards: document.querySelectorAll('[data-testid^="organisation-type-"][role="radio"]').length,
    continueDisabled: document.querySelector('[data-testid="organisation-type-continue"]')?.disabled,
  }))()`);
  assert.equal(initialState.cards, 8);
  assert.equal(initialState.continueDisabled, true, "users must choose a subtype before continuing");

  const unselectedBorder = await client.evaluate(
    `getComputedStyle(document.querySelector('[data-testid="organisation-type-charity"]')).borderColor`,
  );
  await tapTestId(client, "organisation-type-charity");
  const selectedBorder = await waitForValue(
    client,
    `getComputedStyle(document.querySelector('[data-testid="organisation-type-charity"]')).borderColor`,
    (value) => value !== unselectedBorder,
    "the selected organisation subtype state",
  );
  assert.notEqual(selectedBorder, unselectedBorder);
  const continueDisabled = await client.evaluate(
    `document.querySelector('[data-testid="organisation-type-continue"]')?.disabled`,
  );
  assert.equal(continueDisabled, false);
  await client.evaluate(
    `document.querySelector('[data-testid="organisation-type-continue"]')?.scrollIntoView({ block: "center" })`,
  );
  await tapTestId(client, "organisation-type-continue");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="login-choice-email"]'))`,
    Boolean,
    "the sign-in choices after selecting an organisation subtype",
  );
  await tapTestId(client, "login-choice-email");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="email-auth-mode-switch"]'))`,
    Boolean,
    "the organisation email login form",
  );
  const organisationLoginText = await client.evaluate("document.body.innerText");
  assert.match(organisationLoginText, /ORGANISATION PORTAL/);
  assert.match(organisationLoginText, /Welcome back/);
  assert.match(organisationLoginText, /Email or username/);
  assert.match(organisationLoginText, /Password/);
});