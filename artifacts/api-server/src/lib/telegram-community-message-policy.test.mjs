import assert from "node:assert/strict";
import test from "node:test";
import {
  isCountableTelegramCommunityMessage,
  isNewTelegramCommunityMessageId,
} from "./telegram-community-message-policy.ts";

test("counts human-authored text and media messages", () => {
  assert.equal(
    isCountableTelegramCommunityMessage({ from: { is_bot: false }, text: "Hello" }),
    true,
  );
  assert.equal(
    isCountableTelegramCommunityMessage({ from: { is_bot: false }, photo: [{}] }),
    true,
  );
  assert.equal(
    isCountableTelegramCommunityMessage({ from: { is_bot: false }, text: "/help" }),
    true,
  );
});

test("does not count bots, anonymous messages, or Telegram service events", () => {
  assert.equal(
    isCountableTelegramCommunityMessage({ from: { is_bot: true }, text: "Hello" }),
    false,
  );
  assert.equal(isCountableTelegramCommunityMessage({ sender_chat: { id: 42 } }), false);
  assert.equal(
    isCountableTelegramCommunityMessage({
      from: { is_bot: false },
      new_chat_members: [{ id: 7 }],
    }),
    false,
  );
  assert.equal(
    isCountableTelegramCommunityMessage({
      from: { is_bot: false },
      left_chat_member: { id: 7 },
    }),
    false,
  );
});

test("message IDs are accepted once in increasing chat order", () => {
  assert.equal(isNewTelegramCommunityMessageId(null, 1), true);
  assert.equal(isNewTelegramCommunityMessageId(12, 13), true);
  assert.equal(isNewTelegramCommunityMessageId(12, 12), false);
  assert.equal(isNewTelegramCommunityMessageId(12, 11), false);
  assert.equal(isNewTelegramCommunityMessageId(12, 0), false);
});
