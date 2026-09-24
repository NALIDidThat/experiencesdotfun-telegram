import assert from "node:assert/strict";
import test from "node:test";
import {
  makeChatCompatibleKeyboard,
  parseTelegramCommand,
} from "./telegram-utils.ts";

test("group command mentions dispatch to this bot and preserve arguments", () => {
  assert.deepEqual(
    parseTelegramCommand("/start@ExperiencesDotFun_Bot", "experiencesdotfun_bot"),
    { command: "/start", args: [] },
  );
  assert.deepEqual(
    parseTelegramCommand("/rank@experiencesdotfun_bot @alice", "experiencesdotfun_bot"),
    { command: "/rank", args: ["@alice"] },
  );
  assert.equal(
    parseTelegramCommand("/start@another_bot", "experiencesdotfun_bot"),
    null,
  );
});

test("group keyboards replace unsupported web app buttons with URL buttons", () => {
  const keyboard = [
    [
      { text: "Open app", web_app: { url: "https://example.test/?screen=home" } },
      { text: "Help", callback_data: "help" },
    ],
  ];

  assert.deepEqual(makeChatCompatibleKeyboard(-100123, keyboard), [
    [
      { text: "Open app", url: "https://example.test/?screen=home" },
      { text: "Help", callback_data: "help" },
    ],
  ]);
  assert.deepEqual(makeChatCompatibleKeyboard(123, keyboard), keyboard);
});