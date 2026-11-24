import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVerifiedProgression,
  getExperienceXpProgress,
} from "./xp-progression.mjs";

test("experience XP progress starts at Explorer and advances within a level", () => {
  assert.deepEqual(getExperienceXpProgress(0), {
    level: "Explorer",
    levelProgress: 0,
    nextLevelXp: 500,
    xpToNextLevel: 500,
  });
  assert.deepEqual(getExperienceXpProgress(250), {
    level: "Explorer",
    levelProgress: 50,
    nextLevelXp: 500,
    xpToNextLevel: 250,
  });
});

test("experience XP level thresholds reset progress at each new level", () => {
  assert.deepEqual(getExperienceXpProgress(499), {
    level: "Explorer",
    levelProgress: 99,
    nextLevelXp: 500,
    xpToNextLevel: 1,
  });
  assert.deepEqual(getExperienceXpProgress(500), {
    level: "Contributor",
    levelProgress: 0,
    nextLevelXp: 1_500,
    xpToNextLevel: 1_000,
  });
  assert.equal(getExperienceXpProgress(1_500).level, "Champion");
  assert.equal(getExperienceXpProgress(2_500).level, "Leader");
});

test("every level threshold has a one-point-before and exact-threshold state", () => {
  for (const [threshold, levelBefore, levelAt] of [
    [500, "Explorer", "Contributor"],
    [1_500, "Contributor", "Champion"],
    [2_500, "Champion", "Leader"],
    [5_000, "Leader", "Legend"],
  ]) {
    const before = getExperienceXpProgress(threshold - 1);
    assert.equal(before.level, levelBefore);
    assert.equal(before.xpToNextLevel, 1);
    assert.equal(before.levelProgress, 99);

    const at = getExperienceXpProgress(threshold);
    assert.equal(at.level, levelAt);
    assert.equal(at.levelProgress, levelAt === "Legend" ? 100 : 0);
  }
});

test("Legend is the maximum level and has no next-level target", () => {
  assert.deepEqual(getExperienceXpProgress(5_000), {
    level: "Legend",
    levelProgress: 100,
    nextLevelXp: null,
    xpToNextLevel: null,
  });
  assert.equal(getExperienceXpProgress(8_000).levelProgress, 100);
});

test("invalid or negative XP cannot produce negative progression", () => {
  assert.deepEqual(getExperienceXpProgress(-20), getExperienceXpProgress(0));
  assert.deepEqual(getExperienceXpProgress(Number.NaN), getExperienceXpProgress(0));
});

const verifiedEvent = (verifiedAt, status = "verified", sourceId) => ({
  sourceId,
  status,
  verifiedAt,
});

test("only verified experience and milestone events advance missions and achievements", () => {
  const summary = buildVerifiedProgression({
    balanceXp: 120,
    pendingXp: 40,
    verifiedExperiences: [
      verifiedEvent("2026-03-01T10:00:00.000Z"),
      verifiedEvent("2026-03-02T10:00:00.000Z", "rejected"),
      verifiedEvent(null),
      verifiedEvent("2026-03-03T10:00:00.000Z", "submitted"),
      verifiedEvent("2026-03-04T10:00:00.000Z", "attended"),
    ],
    verifiedMilestones: [],
    now: new Date("2026-03-01T12:00:00.000Z"),
  });

  assert.equal(summary.balanceXp, 120);
  assert.equal(summary.pendingXp, 40);
  assert.equal(summary.level, "Explorer");
  assert.equal(summary.missions[0].progress, 1);
  assert.equal(summary.missions[1].progress, 1);
  assert.equal(summary.achievements[0].unlocked, true);
  assert.equal(summary.streak.currentDays, 1);
});

test("same-day duplicate approvals do not inflate the UTC contribution streak", () => {
  const summary = buildVerifiedProgression({
    balanceXp: 0,
    pendingXp: 0,
    verifiedExperiences: [
      verifiedEvent("2026-03-01T09:00:00.000Z", "verified", "participation-1"),
      verifiedEvent("2026-03-01T18:00:00.000Z", "verified", "participation-1"),
      verifiedEvent("2026-03-02T00:05:00.000Z", "verified", "participation-2"),
    ],
    verifiedMilestones: [],
    now: new Date("2026-03-02T08:00:00.000Z"),
  });

  assert.equal(summary.streak.currentDays, 2);
  assert.equal(summary.streak.longestDays, 2);
  assert.equal(summary.streak.lastVerifiedUtcDate, "2026-03-02");
  assert.equal(summary.streak.timezone, "UTC");
  assert.equal(summary.missions[1].progress, 2);
});

test("late verification credits its verification date and a full idle UTC day resets the streak", () => {
  const summary = buildVerifiedProgression({
    balanceXp: 0,
    pendingXp: 0,
    verifiedExperiences: [
      verifiedEvent("2026-03-01T23:59:00.000Z"),
      verifiedEvent("2026-03-02T00:01:00.000Z"),
      verifiedEvent("2026-03-04T00:01:00.000Z"),
    ],
    verifiedMilestones: [],
    now: new Date("2026-03-04T12:00:00.000Z"),
  });

  assert.equal(summary.streak.currentDays, 1);
  assert.equal(summary.streak.longestDays, 2);
  assert.equal(summary.streak.lastVerifiedUtcDate, "2026-03-04");
  assert.match(summary.rules.lateVerification, /verification date/);
});

test("missions and achievements expose progress without awarding XP", () => {
  const summary = buildVerifiedProgression({
    balanceXp: 499,
    pendingXp: 25,
    verifiedExperiences: [
      verifiedEvent("2026-03-01T12:00:00.000Z"),
      verifiedEvent("2026-03-02T12:00:00.000Z"),
    ],
    verifiedMilestones: [
      verifiedEvent("2026-03-03T12:00:00.000Z"),
    ],
    now: new Date("2026-03-03T12:00:00.000Z"),
  });

  assert.equal(summary.level, "Explorer");
  assert.equal(summary.levelProgress, 99);
  assert.equal(summary.pendingXp, 25);
  assert.deepEqual(summary.nextAction, {
    kind: "redeem_xp",
    label: "Redeem 25 pending XP",
  });
  assert.equal(summary.missions[1].status, "completed");
  assert.equal(summary.balanceXp, 499);
});
