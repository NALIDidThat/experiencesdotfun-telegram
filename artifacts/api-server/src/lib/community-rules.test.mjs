import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCommunityRanks,
  decideAdminReward,
  decideMessageAward,
  extractCommunityMessageLinks,
  getCommunityLevel,
  getMessageQualification,
  isCommunityLinkWhitelisted,
  parseAdminRewardAmount,
  countWords,
  isTelegramChatMember,
  matchesCommunityModerationPhrase,
  normalizeCommunityLink,
  normalizeCommunityModerationPhrase,
  normalizePublicTelegramGroupUsername,
} from "./community-rules.ts";

test("word counting uses whitespace and enforces the seven-word threshold", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("one two three four five six"), 6);
  assert.equal(countWords("one two three four five six seven"), 7);
  assert.equal(countWords(" one   two\nthree\tfour five six seven "), 7);
  assert.equal(countWords(Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ")), 20);
});

test("commands, bots, private chats, and short messages are not eligible", () => {
  const text = "this is a sufficiently long contribution for the community";
  assert.equal(getMessageQualification({ text, isGroup: false, isBot: false }).reason, "not_a_group");
  assert.equal(getMessageQualification({ text, isGroup: true, isBot: true }).reason, "bot_message");
  assert.equal(getMessageQualification({ text: "/rank @person", isGroup: true, isBot: false }).reason, "command");
  assert.equal(getMessageQualification({ text: "one two three", isGroup: true, isBot: false }).reason, "too_short");
  assert.equal(getMessageQualification({ text, isGroup: true, isBot: false }).qualifies, true);
});

test("message award decisions enforce duplicate, minute, lifetime member, and community daily limits", () => {
  assert.deepEqual(
    decideMessageAward({
      isDuplicate: true,
      qualifyingMessagesInLastMinute: 0,
      memberXp: 0,
      communityXpToday: 0,
    }),
    { xpAwarded: 0, reason: "duplicate_content" },
  );
  assert.deepEqual(
    decideMessageAward({
      isDuplicate: false,
      qualifyingMessagesInLastMinute: 20,
      memberXp: 0,
      communityXpToday: 0,
    }),
    { xpAwarded: 0, reason: "rate_limited" },
  );
  assert.deepEqual(
    decideMessageAward({
      isDuplicate: false,
      qualifyingMessagesInLastMinute: 19,
      memberXp: 249,
      communityXpToday: 999,
    }),
    { xpAwarded: 1, reason: "qualified" },
  );
  assert.deepEqual(
    decideMessageAward({
      isDuplicate: false,
      qualifyingMessagesInLastMinute: 0,
      memberXp: 250,
      communityXpToday: 0,
    }),
    { xpAwarded: 0, reason: "member_lifetime_cap" },
  );
  assert.deepEqual(
    decideMessageAward({
      isDuplicate: false,
      qualifyingMessagesInLastMinute: 0,
      memberXp: 0,
      communityXpToday: 1_000,
    }),
    { xpAwarded: 0, reason: "community_daily_cap" },
  );
});

test("admin XP adjustments accept exact bounded signed integers", () => {
  assert.equal(parseAdminRewardAmount("+1"), 1);
  assert.equal(parseAdminRewardAmount("+20"), 20);
  assert.equal(parseAdminRewardAmount("-1"), -1);
  assert.equal(parseAdminRewardAmount("-20"), -20);
  for (const value of [
    "1",
    "-10xp",
    "+xp",
    "++1",
    "--1",
    "+ 10",
    "- 10",
    "+10xp",
    "+1000",
    "-21",
    "+0",
    "-0",
    "+01",
    "-01",
  ]) {
    assert.equal(parseAdminRewardAmount(value), null, value);
  }
});

test("admin XP adjustments enforce daily, member, and community limits", () => {
  assert.deepEqual(
    decideAdminReward({
      amount: 10,
      adminXpToday: 10,
      recipientLifetimeXp: 200,
      communityXpToday: 700,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: 1,
      adminXpToday: 20,
      recipientLifetimeXp: 20,
      communityXpToday: 20,
    }),
    { allowed: false, reason: "per_admin_daily_limit" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: 10,
      adminXpToday: 0,
      recipientLifetimeXp: 0,
      communityXpToday: 995,
    }),
    { allowed: false, reason: "community_daily_cap" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: 10,
      adminXpToday: 0,
      recipientLifetimeXp: 245,
      communityXpToday: 0,
    }),
    { allowed: false, reason: "member_lifetime_cap" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: 21,
      adminXpToday: 0,
      recipientLifetimeXp: 0,
      communityXpToday: 0,
    }),
    { allowed: false, reason: "invalid_amount" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: -10,
      adminXpToday: 0,
      recipientLifetimeXp: 20,
      communityXpToday: 1_000,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: -10,
      adminXpToday: 0,
      recipientLifetimeXp: 9,
      communityXpToday: 0,
    }),
    { allowed: false, reason: "insufficient_member_xp" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: -10,
      adminXpToday: 11,
      recipientLifetimeXp: 20,
      communityXpToday: 0,
    }),
    { allowed: false, reason: "per_admin_daily_limit" },
  );
  assert.deepEqual(
    decideAdminReward({
      amount: -21,
      adminXpToday: 0,
      recipientLifetimeXp: 25,
      communityXpToday: 0,
    }),
    { allowed: false, reason: "invalid_amount" },
  );
});

test("community levels advance at the configured thresholds", () => {
  assert.equal(getCommunityLevel(49).label, "Newcomer");
  assert.equal(getCommunityLevel(50).label, "Participant");
  assert.equal(getCommunityLevel(200).label, "Contributor");
  assert.equal(getCommunityLevel(500).label, "Community Builder");
  assert.equal(getCommunityLevel(1_000).label, "Community Leader");
  assert.equal(getCommunityLevel(1_000).nextLevelXp, null);
});

test("community leaderboard tie-breakers are deterministic", () => {
  const earlier = new Date("2026-01-01T00:00:00.000Z");
  const later = new Date("2026-01-02T00:00:00.000Z");
  assert.ok(compareCommunityRanks(
    { communityXp: 100, contributionCount: 5, communityXpUpdatedAt: earlier, userId: 2 },
    { communityXp: 100, contributionCount: 5, communityXpUpdatedAt: later, userId: 1 },
  ) < 0);
  assert.ok(compareCommunityRanks(
    { communityXp: 100, contributionCount: 6, communityXpUpdatedAt: later, userId: 2 },
    { communityXp: 100, contributionCount: 5, communityXpUpdatedAt: earlier, userId: 1 },
  ) < 0);
});

test("public Telegram group identifiers normalize safely", () => {
  assert.equal(normalizePublicTelegramGroupUsername("@local_community"), "local_community");
  assert.equal(normalizePublicTelegramGroupUsername("t.me/local_community"), "local_community");
  assert.equal(
    normalizePublicTelegramGroupUsername("https://telegram.me/local_community/"),
    "local_community",
  );
  for (const value of [
    "",
    "@tiny",
    "https://example.com/local_community",
    "https://t.me/+privateInvite",
    "t.me/local_community/extra",
  ]) {
    assert.equal(normalizePublicTelegramGroupUsername(value), null, value);
  }
});

test("Telegram group membership accepts active members but not departed or restricted non-members", () => {
  for (const status of ["creator", "administrator", "member"]) {
    assert.equal(isTelegramChatMember({ status }), true);
  }
  assert.equal(isTelegramChatMember({ status: "restricted", is_member: true }), true);
  for (const member of [
    { status: "restricted", is_member: false },
    { status: "left" },
    { status: "kicked" },
    { status: "unknown" },
  ]) {
    assert.equal(isTelegramChatMember(member), false);
  }
});

test("community keyword phrases normalize safely and enforce whole-word boundaries", () => {
  assert.equal(normalizeCommunityModerationPhrase("  FREE   Crypto "), "free crypto");
  assert.equal(normalizeCommunityModerationPhrase("a"), null);
  assert.equal(normalizeCommunityModerationPhrase("x".repeat(81)), null);
  assert.equal(normalizeCommunityModerationPhrase("bad\u0000phrase"), null);

  assert.equal(matchesCommunityModerationPhrase("Get FREE crypto now", "free crypto"), true);
  assert.equal(matchesCommunityModerationPhrase("free   crypto", "free crypto"), true);
  assert.equal(matchesCommunityModerationPhrase("a-free crypto-link", "free crypto"), true);
  assert.equal(matchesCommunityModerationPhrase("freedom crypto", "free crypto"), false);
  assert.equal(matchesCommunityModerationPhrase("free cryptocurrencies", "free crypto"), false);
  assert.equal(matchesCommunityModerationPhrase("free (crypto) today", "(crypto)"), true);
});

test("community link rules normalize safely and enforce host and path boundaries", () => {
  assert.deepEqual(normalizeCommunityLink(" Example.org/guides/ "), {
    canonicalLink: "https://example.org/guides",
    normalizedHost: "example.org",
    normalizedPath: "/guides",
  });
  assert.equal(normalizeCommunityLink("ftp://example.org"), null);
  assert.equal(normalizeCommunityLink("https://user:password@example.org"), null);
  assert.equal(normalizeCommunityLink("not a link"), null);

  const text = "See example.org/start, www.other.org and click here";
  const hiddenLinkStart = text.indexOf("click here");
  const links = extractCommunityMessageLinks(text, [{
    type: "text_link",
    offset: hiddenLinkStart,
    length: "click here".length,
    url: "https://hidden.example/path",
  }]);
  assert.deepEqual(links, [
    "https://hidden.example/path",
    "https://example.org/start",
    "https://www.other.org/",
  ]);

  const allowed = [normalizeCommunityLink("example.org/guides")];
  assert.equal(isCommunityLinkWhitelisted("https://sub.example.org/guides/entry?ref=chat", allowed), true);
  assert.equal(isCommunityLinkWhitelisted("https://example.org/guides", allowed), true);
  assert.equal(isCommunityLinkWhitelisted("https://example.org/guidelines", allowed), false);
  assert.equal(isCommunityLinkWhitelisted("https://notexample.org/guides/entry", allowed), false);
});