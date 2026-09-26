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

test("form remains scrollable and focused across a mobile keyboard resize", async (t) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  assert.ok(domain, "REPLIT_EXPO_DEV_DOMAIN must be set to run the mobile preview interaction test.");

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
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let chromiumErrors = "";
  chromium.stderr.setEncoding("utf8");
  chromium.stderr.on("data", (chunk) => { chromiumErrors += chunk; });
  let client;

  t.after(async () => {
    client?.close();
    chromium.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chromium.once("exit", resolve)),
      delay(3_000),
    ]);
    if (chromium.exitCode === null) chromium.kill("SIGKILL");
    await rm(profileDir, { recursive: true, force: true });
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
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: initialViewport.width,
    height: initialViewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
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

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: initialViewport.width,
    height: keyboardViewportHeight,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const keyboardOpen = await waitForValue(
    client,
    readFormState,
    (state) => Math.abs(state.shellHeight - keyboardViewportHeight) <= 4,
    "the app shell to shrink with the emulated keyboard",
  );
  assert.ok(Math.abs(keyboardOpen.viewportHeight - keyboardViewportHeight) <= 4,
    `The visual viewport should be ${keyboardViewportHeight}px while the keyboard is emulated; got ${keyboardOpen.viewportHeight}px.`);

  const wheelY = Math.round((keyboardOpen.scrollTopEdge + keyboardOpen.scrollBottomEdge) / 2);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: Math.round(initialViewport.width / 2),
    y: wheelY,
    deltaX: 0,
    deltaY: 1600,
  });
  const scrolled = await waitForValue(
    client,
    readFormState,
    (state) => state.scrollTop > 0
      && state.lastInputBottom <= state.scrollBottomEdge + 2,
    "the final form field to become visible by scrolling",
  );
  assert.equal(scrolled.activeTestId, "keyboard-test-input-0",
    "Scrolling to lower fields must not blur the field that was already focused.");

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

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: initialViewport.width,
    height: initialViewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
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