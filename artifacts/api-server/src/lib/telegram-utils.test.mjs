import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTelegramAddCommunityUrl,
  buildWelcomeKeyboard,
  escapeTelegramHtml,
  formatTelegramExperienceDate,
  formatTelegramAiReply,
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
    parseTelegramCommand("/clue@experiencesdotfun_bot", "experiencesdotfun_bot"),
    { command: "/clue", args: [] },
  );
  assert.deepEqual(
    parseTelegramCommand("/start invite_opaque-token", "experiencesdotfun_bot"),
    { command: "/start", args: ["invite_opaque-token"] },
  );
  assert.deepEqual(
    parseTelegramCommand("/start@experiencesdotfun_bot community", "experiencesdotfun_bot"),
    { command: "/start", args: ["community"] },
  );
  assert.equal(
    parseTelegramCommand("/start@another_bot", "experiencesdotfun_bot"),
    null,
  );
});

test("add community deep link opens Telegram's add-to-group flow", () => {
  assert.equal(
    buildTelegramAddCommunityUrl("@experiencesdotfun_bot"),
    "https://t.me/experiencesdotfun_bot?startgroup=community",
  );
  assert.equal(buildTelegramAddCommunityUrl("not a username"), null);
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
  assert.match(message, /Find real-world experiences, join your community/);
  assert.match(message, /Get recognised when your contribution is verified/);
  assert.match(message, /Choose an option below to open the app\.$/);
  assert.doesNotMatch(message, /on-chain|Social OS/);

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
  assert.match(joined, /After verification, <b>\+25 XP<\/b> will be ready to redeem/);
  assert.match(joined, /This experience lists a <b>£5\.00<\/b> reward/);
  assert.match(joined, /London &amp; beyond/);
  assert.doesNotMatch(joined, /You(?:'|’) earned \+25 XP/);

  const friendRequest = formatFriendRequestNotice("Alice", "alice&bob");
  assert.match(friendRequest, /@alice&amp;bob/);
  assert.match(formatFriendRequestNotice("<Alice>", null), /&lt;Alice&gt;/);

  const verified = formatContributionVerifiedNotice(experience);
  assert.match(verified, /<b>\+25 Experience XP<\/b> is ready to redeem/);
  assert.match(verified, /add it to your profile balance/);
  assert.match(verified, /host confirmed a reward of <b>£5\.00<\/b>/);
  assert.match(formatContributionRejectedNotice(experience), /No XP or reward was added/);
});

test("Telegram HTML escaping handles all markup-sensitive characters", () => {
  assert.equal(escapeTelegramHtml("<a & b>"), "&lt;a &amp; b&gt;");
});

test("experience dates are readable in Telegram messages", () => {
  assert.equal(formatTelegramExperienceDate("2026-09-25"), "Fri 25 Sept");
  assert.equal(formatTelegramExperienceDate("not-a-date"), "not-a-date");
});

test("AI replies format common Markdown safely and stay within Telegram's message limit", () => {
  const reply = formatTelegramAiReply(
    "**Your next step**\n- Join <Park cleanup>\nUse `/experiences` to browse.",
    [{ title: "Source & details", url: 'https://example.test/search?q=a&label="park"' }],
  );

  assert.match(reply, /<b>Your next step<\/b>/);
  assert.match(reply, /• Join &lt;Park cleanup&gt;/);
  assert.match(reply, /<code>\/experiences<\/code>/);
  assert.match(reply, /Source &amp; details/);
  assert.match(reply, /&quot;park&quot;/);
  assert.ok(reply.length <= 4000);

  const longReply = formatTelegramAiReply("A".repeat(10_000), []);
  assert.ok(longReply.length <= 4000);
  assert.ok(longReply.endsWith("…"));
});
