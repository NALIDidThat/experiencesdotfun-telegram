import assert from "node:assert/strict";
import test from "node:test";
import { buildXpAwardsResponse, EMAIL_SIGNUP_XP_SOURCE_ID } from "./xp-award-rules.ts";

const profileCreatedAt = new Date("2026-01-01T00:00:00.000Z");

test("XP history identifies legacy sources and preserves the credited balance", () => {
  const response = buildXpAwardsResponse({
    balanceXp: 180,
    profileCreatedAt,
    persistedAwards: [
      {
        id: 11,
        sourceType: "experience",
        sourceId: "21",
        sourceTitle: "Park clean-up",
        amount: 40,
        status: "pending",
        awardedAt: new Date("2026-02-01T10:00:00.000Z"),
      },
    ],
    legacyExperiences: [
      {
        participationId: 19,
        title: "Park clean-up",
        amount: 60,
        awardedAt: new Date("2026-01-20T10:00:00.000Z"),
      },
      {
        participationId: 22,
        title: "Community garden",
        amount: 30,
        awardedAt: new Date("2026-01-25T10:00:00.000Z"),
      },
    ],
    hasLegacyEmailSignup: true,
    signupXpReward: 50,
  });

  assert.equal(response.balanceXp, 180);
  assert.equal(response.pendingXp, 40);
  assert.deepEqual(
    response.awards.map(({ sourceType, sourceId, amount, status }) => ({
      sourceType,
      sourceId,
      amount,
      status,
    })),
    [
      { sourceType: "experience", sourceId: "21", amount: 40, status: "pending" },
      { sourceType: "experience", sourceId: "22", amount: 30, status: "redeemed" },
      { sourceType: "experience", sourceId: "19", amount: 60, status: "redeemed" },
      {
        sourceType: "email_signup",
        sourceId: EMAIL_SIGNUP_XP_SOURCE_ID,
        amount: 50,
        status: "redeemed",
      },
      { sourceType: "legacy_balance", sourceId: "profile-balance", amount: 40, status: "redeemed" },
    ],
  );
});

test("unmatched existing profile XP is shown as previously credited balance", () => {
  const response = buildXpAwardsResponse({
    balanceXp: 95,
    profileCreatedAt,
    persistedAwards: [],
    legacyExperiences: [],
    hasLegacyEmailSignup: false,
    signupXpReward: 50,
  });

  assert.equal(response.pendingXp, 0);
  assert.deepEqual(response.awards, [
    {
      id: "legacy:balance",
      sourceType: "legacy_balance",
      sourceId: "profile-balance",
      title: "Previously credited XP balance",
      amount: 95,
      status: "redeemed",
      awardedAt: profileCreatedAt.toISOString(),
    },
  ]);
});

test("legacy XP sources are not duplicated after they have a persistent ledger record", () => {
  const response = buildXpAwardsResponse({
    balanceXp: 50,
    profileCreatedAt,
    persistedAwards: [
      {
        id: 9,
        sourceType: "email_signup",
        sourceId: EMAIL_SIGNUP_XP_SOURCE_ID,
        sourceTitle: "Email sign-up bonus",
        amount: 50,
        status: "redeemed",
        awardedAt: profileCreatedAt,
      },
    ],
    legacyExperiences: [],
    hasLegacyEmailSignup: true,
    signupXpReward: 50,
  });

  assert.equal(response.awards.length, 1);
  assert.equal(response.pendingXp, 0);
});