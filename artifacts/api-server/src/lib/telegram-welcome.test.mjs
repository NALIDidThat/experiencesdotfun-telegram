import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTelegramWelcomeKeyboard,
  isValidTelegramWelcomeButtonUrl,
} from "./telegram-welcome.ts";

test("welcome buttons stay in order with one button per Telegram row", () => {
  assert.deepEqual(
    buildTelegramWelcomeKeyboard([
      { label: "Get started", url: "https://example.org/start" },
      { label: "Explore", url: "https://example.org/explore" },
      { label: "Contact us", url: "https://example.org/contact" },
    ]),
    [
      [{ text: "Get started", url: "https://example.org/start" }],
      [{ text: "Explore", url: "https://example.org/explore" }],
      [{ text: "Contact us", url: "https://example.org/contact" }],
    ],
  );
});

test("welcome message without buttons has no Telegram keyboard", () => {
  assert.equal(buildTelegramWelcomeKeyboard([]), undefined);
});

test("welcome button links must use HTTPS and cannot contain credentials", () => {
  assert.equal(isValidTelegramWelcomeButtonUrl("https://example.org/welcome"), true);
  assert.equal(isValidTelegramWelcomeButtonUrl("http://example.org/welcome"), false);
  assert.equal(isValidTelegramWelcomeButtonUrl("javascript:alert(1)"), false);
  assert.equal(isValidTelegramWelcomeButtonUrl("https://user:pass@example.org"), false);
});
