import assert from "node:assert/strict";
import test from "node:test";
import { shouldStartTelegramPolling } from "./telegram-polling-policy.ts";

test("production owns Telegram polling by default", () => {
  assert.equal(shouldStartTelegramPolling("production", undefined), true);
});

test("development does not compete with the production bot by default", () => {
  assert.equal(shouldStartTelegramPolling("development", undefined), false);
});

test("polling can be explicitly enabled for a single local bot process", () => {
  assert.equal(shouldStartTelegramPolling("development", "true"), true);
});

test("polling can be explicitly disabled in production", () => {
  assert.equal(shouldStartTelegramPolling("production", "false"), false);
});