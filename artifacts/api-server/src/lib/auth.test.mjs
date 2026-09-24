import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyTelegramInitData } from "./telegram-init-data.ts";

const testBotToken = "test-bot-token";

function signedInitData(authDate) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAEAA-test",
    user: JSON.stringify({ id: 123456789, first_name: "Test" }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(testBotToken)
    .digest();
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("accepts recent Telegram init data and small clock skew", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(verifyTelegramInitData(signedInitData(now), testBotToken).id, 123456789);
  assert.equal(verifyTelegramInitData(signedInitData(now + 30), testBotToken).id, 123456789);
});

test("rejects Telegram init data dated too far in the future", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(
    () => verifyTelegramInitData(signedInitData(now + 61), testBotToken),
    /expired/,
  );
});

test("rejects Telegram init data older than 24 hours", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(
    () => verifyTelegramInitData(signedInitData(now - 86_401), testBotToken),
    /expired/,
  );
});