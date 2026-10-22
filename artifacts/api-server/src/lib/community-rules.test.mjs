import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCommunityRanks,
  decideAdminReward,
  decideMessageAward,
  getCommunityLevel,
  getMessageQualification,
  parseAdminRewardAmount,
  countWords,
  isTelegramChatMember,
  matchesCommunityModerationPhrase,
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

test("message award decisions enforce duplicate, minute, and UTC-day limits", () => {
  assert.deepEqual(
    decideMessageAward({ isDuplicate: true, qualifyingMessagesInLastMinute: 0, xpToday: 0 }),
    { xpAwarded: 0, reason: "duplicate_content" },
  );
  assert.deepEqual(
    decideMessageAward({ isDuplicate: false, qualifyingMessagesInLastMinute: 20, xpToday: 0 }),
    { xpAwarded: 0, reason: "rate_limited" },
  );
  assert.deepEqual(
    decideMessageAward({ isDuplicate: false, qualifyingMessagesInLastMinute: 19, xpToday: 99 }),
    { xpAwarded: 1, reason: "qualified" },
  );
  assert.deepEqual(
    decideMessageAward({ isDuplicate: false, qualifyingMessagesInLastMinute: 0, xpToday: 100 }),
    { xpAwarded: 0, reason: "daily_cap" },
  );
});

test("admin recognition accepts only exact bounded +integer commands", () => {
  assert.equal(parseAdminRewardAmount("+1"), 1);
  assert.equal(parseAdminRewardAmount("+20"), 20);
  for (const value of ["1", "+xp", "++1", "+ 10", "+10xp", "+1000", "+0", "+01"]) {
    assert.equal(parseAdminRewardAmount(value), null, value);
  }
});

test("admin recognition enforces per-admin and community daily caps", () => {
  assert.deepEqual(
    decideAdminReward({ amount: 10, adminXpToday: 10, recipientXpToday: 20 }),
    { allowed: true },
  );
  assert.deepEqual(
    decideAdminReward({ amount: 1, adminXpToday: 20, recipientXpToday: 20 }),
    { allowed: false, reason: "per_admin_daily_limit" },
  );
  assert.deepEqual(
    decideAdminReward({ amount: 10, adminXpToday: 0, recipientXpToday: 95 }),
    { allowed: false, reason: "community_daily_cap" },
  );
  assert.deepEqual(
    decideAdminReward({ amount: 21, adminXpToday: 0, recipientXpToday: 0 }),
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