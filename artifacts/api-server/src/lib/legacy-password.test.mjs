import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyLegacyPassword } from "./legacy-password.ts";

const salt = Buffer.alloc(16, 7);
const password = "legacy-password-for-test";
const hash = `${salt.toString("hex")}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;

test("verifies a legacy scrypt password", () => {
  assert.equal(verifyLegacyPassword(password, hash), true);
  assert.equal(verifyLegacyPassword("wrong-password", hash), false);
});

test("rejects missing and malformed legacy hashes", () => {
  assert.equal(verifyLegacyPassword(password, null), false);
  assert.equal(verifyLegacyPassword(password, ""), false);
  assert.equal(verifyLegacyPassword(password, "not-a-hash"), false);
});