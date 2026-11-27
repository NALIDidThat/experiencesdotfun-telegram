import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const screenSource = await readFile(
  new URL("../components/MyTelegramCommunitiesScreen.tsx", import.meta.url),
  "utf8",
);

test("each participant group card opens a member-specific activity view", () => {
  assert.match(screenSource, /testID=\{`my-telegram-community-view-\$\{community\.chatId\}`\}/);
  assert.match(screenSource, /accessibilityHint="Shows your contributions and Community XP in this group\."/);
  assert.match(screenSource, /onPress=\{onSelect\}/);
  assert.match(screenSource, /setSelectedCommunity\(community\)/);
  assert.match(screenSource, /testID=\{`my-telegram-community-detail-\$\{community\.chatId\}`\}/);
  assert.match(screenSource, /testID="my-telegram-community-detail-back"/);
});

test("the member view shows tracked activity and group-scoped contribution data", () => {
  assert.match(screenSource, /useGetCommunityDetails\(community\.chatId/);
  assert.match(screenSource, /enabled: community\.rank !== null/);
  assert.match(screenSource, /community\.messageCount\.toLocaleString\(\)/);
  assert.match(screenSource, /community\.qualifyingMessageCount\.toLocaleString\(\)/);
  assert.match(screenSource, /community\.communityXp\.toLocaleString\(\)/);
  assert.match(screenSource, /community\.contributionCount\.toLocaleString\(\)/);
  assert.match(screenSource, /community\.levelProgress/);
  assert.match(screenSource, /detailsQuery\.data\.recentContributions/);
  assert.match(screenSource, /No Community XP has been recorded for you in this group yet/);
});

test("the existing Telegram group action remains separate from opening member details", () => {
  assert.match(screenSource, /testID=\{`my-telegram-community-open-\$\{community\.chatId\}`\}/);
  assert.match(screenSource, /onPress=\{\(\) => openTelegramLink\(community\.openUrl!\)\}/);
  assert.match(screenSource, /testID=\{`my-telegram-community-detail-open-\$\{community\.chatId\}`\}/);
});
