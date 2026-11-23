import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTelegramCustomCommand,
  normalizeTelegramCustomCommandResponse,
  TELEGRAM_CUSTOM_COMMAND_LIMIT,
} from "./telegram-custom-command-rules.mjs";

test("custom command names normalize slash prefixes and casing", () => {
  assert.equal(normalizeTelegramCustomCommand("/CA"), "ca");
  assert.equal(normalizeTelegramCustomCommand(" project_info "), "project_info");
});

test("custom command names reject invalid and reserved commands", () => {
  for (const value of ["", "with spaces", "bad-name", "a".repeat(33), "/help", "/community"]) {
    assert.equal(normalizeTelegramCustomCommand(value), null);
  }
});

test("custom responses are trimmed and limited to Telegram message length", () => {
  assert.equal(normalizeTelegramCustomCommandResponse("  Contract: 0xabc  "), "Contract: 0xabc");
  assert.equal(normalizeTelegramCustomCommandResponse("  "), null);
  assert.equal(normalizeTelegramCustomCommandResponse("x".repeat(3501)), null);
  assert.equal(normalizeTelegramCustomCommandResponse("x".repeat(3500))?.length, 3500);
});

test("the configured capacity supports at least three commands", () => {
  assert.ok(TELEGRAM_CUSTOM_COMMAND_LIMIT >= 3);
});
