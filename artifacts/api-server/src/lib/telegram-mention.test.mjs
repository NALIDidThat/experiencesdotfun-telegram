import assert from "node:assert/strict";
import test from "node:test";
import { extractBotMentionedText } from "./telegram-mention.ts";

const botUsername = "experiencesdotfun_bot";
const botId = 12345;

test("does not treat ordinary group text as addressed to the bot", () => {
  assert.equal(
    extractBotMentionedText("A normal group message", [], botUsername, botId),
    null,
  );
});

test("removes a matching Telegram username mention and keeps the question", () => {
  const text = "@ExperiencesDotFun_Bot what is a community garden?";
  assert.equal(
    extractBotMentionedText(
      text,
      [{ type: "mention", offset: 0, length: 23 }],
      botUsername,
      botId,
    ),
    "what is a community garden?",
  );
});

test("recognizes an explicit text mention by Telegram bot id", () => {
  const text = "Could you research this?";
  assert.equal(
    extractBotMentionedText(
      text,
      [{ type: "text_mention", offset: 0, length: text.length, user: { id: botId } }],
      botUsername,
      botId,
    ),
    "",
  );
});

test("does not accept a mention for a different bot", () => {
  assert.equal(
    extractBotMentionedText(
      "@experiencesdotfun_botx hello",
      [{ type: "mention", offset: 0, length: 24 }],
      botUsername,
      botId,
    ),
    null,
  );
});

test("supports explicit username mentions when entity metadata is missing", () => {
  assert.equal(
    extractBotMentionedText("Please help @experiencesdotfun_bot with this", undefined, botUsername, botId),
    "Please help with this",
  );
});
