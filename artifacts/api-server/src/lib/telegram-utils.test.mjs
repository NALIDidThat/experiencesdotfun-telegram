import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWelcomeKeyboard,
  escapeTelegramHtml,
  formatContributionRejectedNotice,
  formatContributionVerifiedNotice,
  formatExperienceJoinedNotice,
  formatFriendRequestNotice,
  formatWelcomeMessage,
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
  assert.deepEqual(
    parseTelegramCommand("/start invite_opaque-token", "experiencesdotfun_bot"),
    { command: "/start", args: ["invite_opaque-token"] },
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

test("welcome message uses the supplied copy and welcome buttons target app screens", () => {
  const message = formatWelcomeMessage();
  assert.match(message, /social platform for discovering, creating and completing real-world experiences/);
  assert.match(message, /Your experiences become your story/);
  assert.match(message, /Your contributions become your reputation/);
  assert.match(message, /Social OS for real-world communities/);
  assert.match(message, /👇 Start exploring our telegram mini-app below$/);

  const keyboard = buildWelcomeKeyboard((path) => `https://example.test${path}`);
  assert.deepEqual(keyboard, [
    [{ text: "Home", web_app: { url: "https://example.test/?screen=home" } }],
    [{ text: "Discover Experiences", web_app: { url: "https://example.test/?screen=explore" } }],
    [{ text: "Profile", web_app: { url: "https://example.test/?screen=profile" } }],
  ]);
  assert.deepEqual(makeChatCompatibleKeyboard(-100123, keyboard), [
    [{ text: "Home", url: "https://example.test/?screen=home" }],
    [{ text: "Discover Experiences", url: "https://example.test/?screen=explore" }],
    [{ text: "Profile", url: "https://example.test/?screen=profile" }],
  ]);
});

test("Telegram notification copy escapes user content and does not promise XP before verification", () => {
  const experience = {
    id: 9,
    title: "Park <clean-up>",
    date: "2026-09-25",
    city: "London & beyond",
    xpReward: 25,
    monetaryRewardPence: 500,
  };
  const joined = formatExperienceJoinedNotice(experience);
  assert.match(joined, /Park &lt;clean-up&gt;/);
  assert.match(joined, /When the host verifies your contribution/);
  assert.match(joined, /\+25 XP · £5\.00/);
  assert.match(joined, /London &amp; beyond/);
  assert.doesNotMatch(joined, /You(?:'|’) earned \+25 XP/);

  const friendRequest = formatFriendRequestNotice("Alice", "alice&bob");
  assert.match(friendRequest, /@alice&amp;bob/);
  assert.match(formatFriendRequestNotice("<Alice>", null), /&lt;Alice&gt;/);

  const verified = formatContributionVerifiedNotice(experience);
  assert.match(verified, /<b>\+25 Experience XP<\/b> is ready to redeem/);
  assert.match(verified, /add it to your profile balance/);
  assert.match(verified, /Reward confirmed: <b>£5\.00<\/b>/);
  assert.match(formatContributionRejectedNotice(experience), /No XP or reward was added/);
});

test("Telegram HTML escaping handles all markup-sensitive characters", () => {
  assert.equal(escapeTelegramHtml("<a & b>"), "&lt;a &amp; b&gt;");
});