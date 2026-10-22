import assert from "node:assert/strict";
import test from "node:test";
import {
  isTelegramPollingConflict,
  shouldStartTelegramPolling,
  TELEGRAM_POLLING_CONFLICT_BACKOFF_MS,
} from "./telegram-polling-policy.ts";

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

test("only getUpdates conflicts are treated as competing pollers", () => {
  assert.equal(
    isTelegramPollingConflict("getUpdates", "Conflict: terminated by other getUpdates request"),
    true,
  );
  assert.equal(isTelegramPollingConflict("getMe", "Conflict"), false);
  assert.equal(isTelegramPollingConflict("getUpdates", "Unauthorized"), false);
});

test("poller backs off on conflicts instead of rapidly repeating requests", () => {
  assert.equal(TELEGRAM_POLLING_CONFLICT_BACKOFF_MS, 30_000);
});