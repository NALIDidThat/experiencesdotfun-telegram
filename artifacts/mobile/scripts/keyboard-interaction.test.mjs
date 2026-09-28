import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const initialViewport = { width: 390, height: 740 };
const keyboardViewportHeight = 430;
const chromiumPath = process.env.CHROMIUM_PATH
  ?? (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : "chromium");

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
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
    client.#socket.addEventListener("close", () => {
      for (const pending of client.#pending.values()) {
        pending.reject(new Error("Chromium DevTools connection closed."));
      }
      client.#pending.clear();
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

async function waitForFile(path, process, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Chromium exited before creating ${path}.`);
    }
    try {
      return await readFile(path, "utf8");
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for Chromium to create ${path}.`);
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

async function launchBrowser(t) {
  const profileDir = await mkdtemp(join(tmpdir(), "experiences-keyboard-test-"));
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
    const waitForExit = () => {
      if (chromium.exitCode !== null || chromium.signalCode !== null) return Promise.resolve();
      return new Promise((resolve) => chromium.once("exit", resolve));
    };
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
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rm(profileDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (!["ENOTEMPTY", "EBUSY", "EPERM"].includes(error.code) || attempt >= 5) throw error;
        await delay(150);
      }
    }
  });

  const activePortFile = join(profileDir, "DevToolsActivePort");
  let activePortContents;
  try {
    activePortContents = await waitForFile(activePortFile, chromium);
  } catch (error) {
    throw new Error(`${error.message}\n${chromiumErrors}`);
  }
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
}

async function setViewport(client, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: initialViewport.width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

function screenStateExpression(scrollerTestId, targetTestId) {
  const scrollerSelector = JSON.stringify(`[data-testid="${scrollerTestId}"]`);
  const targetSelector = JSON.stringify(`[data-testid="${targetTestId}"]`);
  return `(() => {
    const shell = document.querySelector('[data-testid="app-shell"]');
    const scroller = document.querySelector(${scrollerSelector});
    const target = document.querySelector(${targetSelector});
    const shellRect = shell?.getBoundingClientRect();
    const scrollerRect = scroller?.getBoundingClientRect();
    const targetRect = target?.getBoundingClientRect();
    return {
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      shellHeight: shellRect?.height ?? null,
      scrollClientHeight: scroller?.clientHeight ?? null,
      scrollHeight: scroller?.scrollHeight ?? null,
      scrollTop: scroller?.scrollTop ?? null,
      scrollTopEdge: scrollerRect?.top ?? null,
      scrollBottomEdge: scrollerRect?.bottom ?? null,
      targetTop: targetRect?.top ?? null,
      targetBottom: targetRect?.bottom ?? null,
      targetVisible: Boolean(targetRect && scrollerRect
        && targetRect.top >= scrollerRect.top - 2
        && targetRect.bottom <= scrollerRect.bottom + 2),
      windowScrollTop: window.scrollY,
      scrollOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
      activeTag: document.activeElement?.tagName ?? null,
      activeTestId: document.activeElement?.getAttribute("data-testid") ?? null,
      scrollerFound: Boolean(scroller),
      targetFound: Boolean(target),
    };
  })()`;
}

async function tapTestId(client, testId) {
  const selector = JSON.stringify(`[data-testid="${testId}"]`);
  const position = await client.evaluate(`(() => {
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
  assert.ok(position, `Expected test control "${testId}" to be present.`);
  assert.ok(!position.disabled, `Expected test control "${testId}" to be enabled.`);
  assert.ok(position.visible, `Expected test control "${testId}" to be visible in the current viewport.`);
  const { disabled: _disabled, visible: _visible, ...point } = position;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...point,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...point,
    button: "left",
    clickCount: 1,
  });
}

async function enterText(client, testId, text) {
  await tapTestId(client, testId);
  await client.send("Input.insertText", { text });
  const selector = JSON.stringify(`[data-testid="${testId}"]`);
  await waitForValue(
    client,
    `document.querySelector(${selector})?.value ?? null`,
    (value) => value === text,
    `text to appear in "${testId}"`,
  );
}

async function checkRealFormKeyboardBehavior(client, {
  scrollerTestId,
  focusInputTestId,
  targetInputTestId,
  description,
  requireScroll = true,
  scrollDeltaY,
}) {
  const stateExpression = screenStateExpression(scrollerTestId, targetInputTestId);
  const initial = await waitForValue(
    client,
    stateExpression,
    (state) => state.scrollerFound && state.targetFound && state.shellHeight !== null,
    `${description} to render its real input fields`,
  );
  assert.ok(Math.abs(initial.shellHeight - initialViewport.height) <= 4,
    `${description} should start at the full mobile viewport height.`);

  await tapTestId(client, focusInputTestId);
  await waitForValue(
    client,
    `document.activeElement?.getAttribute("data-testid") ?? null`,
    (activeTestId) => activeTestId === focusInputTestId,
    `${description}'s first field to receive focus`,
  );

  await setViewport(client, keyboardViewportHeight);
  const keyboardOpen = await waitForValue(
    client,
    stateExpression,
    (state) => Math.abs(state.shellHeight - keyboardViewportHeight) <= 4
      && state.activeTestId === focusInputTestId,
    `${description} to resize without dropping focus`,
  );
  assert.ok(keyboardOpen.scrollHeight > keyboardOpen.scrollClientHeight,
    `${description} should expose a scrollable region while the keyboard is open.`);

  let scrolled = keyboardOpen;
  if (requireScroll) {
    const wheelY = Math.round((scrolled.scrollTopEdge + scrolled.scrollBottomEdge) / 2);
    const effectiveScrollDelta = scrollDeltaY ?? await client.evaluate(`(() => {
      const scroller = document.querySelector('[data-testid="${scrollerTestId}"]');
      const target = document.querySelector('[data-testid="${targetInputTestId}"]');
      const scrollRect = scroller?.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      return Math.max(120, Math.round((targetRect?.bottom ?? 0) - (scrollRect?.bottom ?? 0) + 40));
    })()`);
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: Math.round(initialViewport.width / 2),
      y: wheelY,
      deltaX: 0,
      deltaY: effectiveScrollDelta,
    });
    await delay(100);
    scrolled = await client.evaluate(stateExpression);
    assert.equal(scrolled.activeTestId, focusInputTestId,
      `Scrolling ${description} should preserve the previously focused field.`);
    assert.ok(scrolled.scrollTop > keyboardOpen.scrollTop + 1,
      `Scrolling ${description} should move its form content.`);
  }
  assert.ok(scrolled.targetVisible,
    `${description}'s lower input should be reachable by scrolling; last state: ${JSON.stringify(scrolled)}.`);

  if (targetInputTestId !== focusInputTestId) {
    await tapTestId(client, targetInputTestId);
    await waitForValue(
      client,
      `document.activeElement?.getAttribute("data-testid") ?? null`,
      (activeTestId) => activeTestId === targetInputTestId,
      `${description}'s lower input to receive focus`,
    );
  }

  await setViewport(client, initialViewport.height);
  const restored = await waitForValue(
    client,
    stateExpression,
    (state) => Math.abs(state.shellHeight - initialViewport.height) <= 4
      && state.activeTestId === targetInputTestId,
    `${description} to restore its full height and keep focus`,
  );
  assert.ok(Math.abs(restored.viewportHeight - initialViewport.height) <= 4,
    `${description} should return to the full visual viewport height.`);
}

const readFormState = `(() => {
  const shell = document.querySelector('[data-testid="app-shell"]');
  const scroller = document.querySelector('[data-testid="keyboard-test-scroll"]');
  const inputs = [...document.querySelectorAll('[data-testid^="keyboard-test-input-"]')];
  const lastInput = inputs.at(-1);
  const shellRect = shell?.getBoundingClientRect();
  const scrollRect = scroller?.getBoundingClientRect();
  const lastRect = lastInput?.getBoundingClientRect();
  return {
    url: location.href,
    pageTitle: document.title,
    pageText: document.body?.innerText?.slice(0, 300) ?? "",
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    shellHeight: shellRect?.height ?? null,
    scrollClientHeight: scroller?.clientHeight ?? null,
    scrollHeight: scroller?.scrollHeight ?? null,
    scrollTop: scroller?.scrollTop ?? null,
    scrollTopEdge: scrollRect?.top ?? null,
    scrollBottomEdge: scrollRect?.bottom ?? null,
    lastInputTop: lastRect?.top ?? null,
    lastInputBottom: lastRect?.bottom ?? null,
    activeTestId: document.activeElement?.getAttribute("data-testid") ?? null,
    focusedLabel: document.querySelector('[data-testid="keyboard-test-focused-field"]')?.textContent?.trim() ?? null,
    inputCount: inputs.length,
  };
})()`;

test("shared form harness remains scrollable across a mobile keyboard resize", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

  const client = await launchBrowser(t);
  await setViewport(client, initialViewport.height);
  await client.send("Page.navigate", {
    url: `https://${domain}/?keyboardTest=1`,
  });

  const initial = await waitForValue(
    client,
    readFormState,
    (state) => state.inputCount === 8 && state.shellHeight !== null,
    "the development keyboard test form",
  );
  assert.ok(Math.abs(initial.shellHeight - initialViewport.height) <= 4,
    `Initial app height should match the mobile viewport (${initialViewport.height}px); got ${initial.shellHeight}px.`);
  assert.ok(initial.scrollHeight > initial.scrollClientHeight,
    "The long form should have scrollable content at the initial mobile height.");

  await client.evaluate(`document.querySelector('[data-testid="keyboard-test-input-0"]').focus()`);
  await waitForValue(
    client,
    readFormState,
    (state) => state.activeTestId === "keyboard-test-input-0",
    "the first form field to receive focus",
  );

  await setViewport(client, keyboardViewportHeight);
  const keyboardOpen = await waitForValue(
    client,
    readFormState,
    (state) => Math.abs(state.shellHeight - keyboardViewportHeight) <= 4,
    "the app shell to shrink with the emulated keyboard",
  );
  assert.ok(Math.abs(keyboardOpen.viewportHeight - keyboardViewportHeight) <= 4,
    `The visual viewport should be ${keyboardViewportHeight}px while the keyboard is emulated; got ${keyboardOpen.viewportHeight}px.`);

  let scrolled = keyboardOpen;
  for (let swipe = 0; swipe < 3 && scrolled.lastInputBottom > scrolled.scrollBottomEdge + 2; swipe += 1) {
    const previousScrollTop = scrolled.scrollTop;
    const x = initialViewport.width - 5;
    const startY = Math.round(scrolled.scrollBottomEdge - 18);
    const endY = Math.round(scrolled.scrollTopEdge + 18);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y: startY, force: 1 }],
    });
    for (const progress of [0.33, 0.66, 1]) {
      await delay(16);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          id: 1,
          x,
          y: Math.round(startY + (endY - startY) * progress),
          force: 1,
        }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    scrolled = await waitForValue(
      client,
      readFormState,
      (state) => state.scrollTop > previousScrollTop + 1
        || state.lastInputBottom <= state.scrollBottomEdge + 2,
      "the form to respond to an upward touch swipe",
    );
    assert.equal(scrolled.activeTestId, "keyboard-test-input-0",
      "Scrolling to lower fields must not blur the field that was already focused.");
  }
  assert.ok(scrolled.lastInputBottom <= scrolled.scrollBottomEdge + 2,
    "The final form field should become visible after upward touch swipes.");

  const lastInputX = Math.round(initialViewport.width / 2);
  const lastInputY = Math.round((scrolled.lastInputTop + scrolled.lastInputBottom) / 2);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: lastInputX,
    y: lastInputY,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: lastInputX,
    y: lastInputY,
    button: "left",
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: lastInputX,
    y: lastInputY,
    button: "left",
    clickCount: 1,
  });
  await waitForValue(
    client,
    readFormState,
    (state) => state.activeTestId === "keyboard-test-input-7",
    "the last form field to receive a tap after scrolling",
  );

  await setViewport(client, initialViewport.height);
  const restored = await waitForValue(
    client,
    readFormState,
    (state) => Math.abs(state.shellHeight - initialViewport.height) <= 4,
    "the app shell to return to its full mobile height",
  );
  assert.equal(restored.activeTestId, "keyboard-test-input-7",
    "Restoring the full viewport should not drop focus from the lower field.");
  assert.ok(Math.abs(restored.viewportHeight - initialViewport.height) <= 4,
    `The visual viewport should return to ${initialViewport.height}px; got ${restored.viewportHeight}px.`);
});

test("actual signup, profile, and experience forms stay usable with the keyboard open", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

  const client = await launchBrowser(t);

  await t.test("email signup keeps the username field reachable", async () => {
    await setViewport(client, initialViewport.height);
    await client.send("Page.navigate", { url: `https://${domain}/?keyboardTest=signup` });
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="email-auth-mode-switch"]'))`,
      Boolean,
      "the real email sign-in screen",
    );
    await tapTestId(client, "email-auth-mode-switch");

    const signupSteps = [
      ["email-signup-name", "Keyboard QA"],
      ["email-signup-email", "keyboard.qa@example.test"],
      ["email-signup-password", "KeyboardPass123!"],
      ["email-signup-confirm-password", "KeyboardPass123!"],
      ["email-signup-username", "keyboard_tester"],
    ];
    for (let index = 0; index < signupSteps.length; index += 1) {
      const [inputTestId, value] = signupSteps[index];
      await waitForValue(
        client,
        `Boolean(document.querySelector('[data-testid="${inputTestId}"]'))`,
        Boolean,
        `signup step ${index + 1}`,
      );
      await enterText(client, inputTestId, value);
      if (index < signupSteps.length - 1) {
        await tapTestId(client, "email-auth-submit");
      }
    }

    await checkRealFormKeyboardBehavior(client, {
      scrollerTestId: "email-auth-scroll",
      focusInputTestId: "email-signup-username",
      targetInputTestId: "email-signup-username",
      description: "Email signup",
      requireScroll: false,
    });
  });

  await t.test("profile editing scrolls to the bio field without losing focus", async () => {
    await setViewport(client, initialViewport.height);
    await client.send("Page.navigate", { url: `https://${domain}/?keyboardTest=profile` });
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="profile-menu-toggle"]'))`,
      Boolean,
      "the real profile screen",
    );
    await tapTestId(client, "profile-menu-toggle");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="profile-menu-edit-profile"]'))`,
      Boolean,
      "the profile edit menu action",
    );
    await tapTestId(client, "profile-menu-edit-profile");
    await waitForValue(
      client,
      `Boolean(document.querySelector('[data-testid="profile-edit-bio"]'))`,
      Boolean,
      "the real profile editor",
    );

    await checkRealFormKeyboardBehavior(client, {
      scrollerTestId: "profile-edit-scroll",
      focusInputTestId: "profile-edit-name",
      targetInputTestId: "profile-edit-bio",
      description: "Profile editing",
    });
  });

});

test("experience creation shows one question and keeps it reachable with the keyboard open", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

  const client = await launchBrowser(t);
  await setViewport(client, initialViewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/?keyboardTest=create&step=2` });
  await waitForValue(
    client,
    `document.querySelectorAll('[data-testid^="create-field-"]').length`,
    (count) => count === 1,
    "the real experience creation form",
  );

  await checkRealFormKeyboardBehavior(client, {
    scrollerTestId: "create-experience-scroll",
    focusInputTestId: "create-field-organisationDescription",
    targetInputTestId: "create-field-organisationDescription",
    description: "Experience creation",
  });
});

test("experience review returns to the overview after saving an edited answer", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

  const client = await launchBrowser(t);
  await setViewport(client, initialViewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/?keyboardTest=create&step=16` });
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the experience review overview",
  );

  await tapTestId(client, "create-review-organisationName");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-field-organisationName"]'))`,
    Boolean,
    "the organisation name question",
  );
  await enterText(client, "create-field-organisationName", "Community Host");
  await tapTestId(client, "create-primary");
  await waitForValue(
    client,
    `Boolean(document.querySelector('[data-testid="create-review-heading"]'))`,
    Boolean,
    "the overview after saving the edited answer",
  );
  assert.equal(
    await client.evaluate(`document.querySelectorAll('[data-testid^="create-field-"]').length`),
    0,
    "The overview should show details instead of an input.",
  );
});

test("bottom navigation can be changed by holding and sliding", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

  const client = await launchBrowser(t);
  await setViewport(client, initialViewport.height);
  await client.send("Page.navigate", { url: `https://${domain}/?navTest=1` });

  const activeTab = `document.querySelector('[data-testid="nav-test-active"]')?.textContent?.trim() ?? null`;
  await waitForValue(client, activeTab, (value) => value === "home", "the bottom-navigation test screen");

  await tapTestId(client, "bottom-nav-tab-explore");
  await waitForValue(client, activeTab, (value) => value === "explore", "a standard navigation tap");

  const start = await client.evaluate(`(() => {
    const element = document.querySelector('[data-testid="bottom-nav-tab-home"]');
    const rect = element?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null;
  })()`);
  const end = await client.evaluate(`(() => {
    const element = document.querySelector('[data-testid="bottom-nav-tab-profile"]');
    const rect = element?.getBoundingClientRect();
    return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null;
  })()`);
  assert.ok(start && end, "The first and last navigation tabs should be visible.");

  await client.evaluate(`(() => {
    const start = ${JSON.stringify(start)};
    const origin = document.querySelector('[data-testid="bottom-nav-tab-home"]');
    const makeTouch = (x, y) => new Touch({
      identifier: 1,
      target: origin,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    });
    const dispatch = (type, touches, changedTouches) => origin.dispatchEvent(new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches,
      changedTouches,
    }));
    let touch = makeTouch(start.x, start.y);
    dispatch('touchstart', [touch], [touch]);
    window.__bottomNavTouchTest = { makeTouch, dispatch };
  })()`);
  await delay(450);
  await client.evaluate(`(() => {
    const { makeTouch, dispatch } = window.__bottomNavTouchTest;
    const start = ${JSON.stringify(start)};
    const end = ${JSON.stringify(end)};
    let touch;
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      touch = makeTouch(
        Math.round(start.x + (end.x - start.x) * progress),
        Math.round(start.y + (end.y - start.y) * progress),
      );
      dispatch('touchmove', [touch], [touch]);
    }
    dispatch('touchend', [], [touch]);
    delete window.__bottomNavTouchTest;
  })()`);

  await waitForValue(client, activeTab, (value) => value === "profile", "the dragged destination tab to open");
});
