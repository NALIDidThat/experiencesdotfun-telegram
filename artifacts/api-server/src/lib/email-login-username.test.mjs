import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidEmailLoginUsername,
  normalizeEmailLoginUsername,
} from "./email-login-username.ts";

test("normalizes case and optional @ prefixes for username login", () => {
  assert.equal(normalizeEmailLoginUsername("  @@Community_123  "), "community_123");
  assert.equal(isValidEmailLoginUsername("@Community_123"), true);
});

test("username login accepts only 5–32 letters, numbers, and underscores", () => {
  assert.equal(isValidEmailLoginUsername("abcd"), false);
  assert.equal(isValidEmailLoginUsername("a".repeat(33)), false);
  assert.equal(isValidEmailLoginUsername("not-a-username"), false);
});