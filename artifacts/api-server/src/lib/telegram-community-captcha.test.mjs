import assert from "node:assert/strict";
import { test } from "node:test";
import { isMatchingTelegramCommunityCaptchaCallback } from "./telegram-community-captcha.ts";

test("join-verification callbacks only match the joined member in the originating group", () => {
  const callbackData = "community:captcha:-100123456789:123456";
  assert.equal(
    isMatchingTelegramCommunityCaptchaCallback({
      callbackData,
      chatId: -100123456789,
      userId: 123456,
    }),
    true,
  );
  assert.equal(
    isMatchingTelegramCommunityCaptchaCallback({
      callbackData,
      chatId: -100123456789,
      userId: 123457,
    }),
    false,
  );
  assert.equal(
    isMatchingTelegramCommunityCaptchaCallback({
      callbackData,
      chatId: -100123456788,
      userId: 123456,
    }),
    false,
  );
  assert.equal(
    isMatchingTelegramCommunityCaptchaCallback({
      callbackData: "community:captcha:not-a-chat:123456",
      chatId: -100123456789,
      userId: 123456,
    }),
    false,
  );
});
