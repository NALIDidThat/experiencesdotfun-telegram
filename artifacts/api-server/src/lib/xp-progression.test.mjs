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
    nextLevelXp: 250,
    xpToNextLevel: 250,
  });
  assert.deepEqual(getExperienceXpProgress(125), {
    level: "Explorer",
    levelProgress: 50,
    nextLevelXp: 250,
    xpToNextLevel: 125,
  });
});

test("experience XP level thresholds reset progress at each new level", () => {
  assert.deepEqual(getExperienceXpProgress(249), {
    level: "Explorer",
    levelProgress: 99,
    nextLevelXp: 250,
    xpToNextLevel: 1,
  });
  assert.deepEqual(getExperienceXpProgress(250), {
    level: "Pathfinder",
    levelProgress: 0,
    nextLevelXp: 500,
    xpToNextLevel: 250,
  });
});

test("every level threshold has a one-point-before and exact-threshold state", () => {
  const levels = [
    { threshold: 250, levelBefore: "Explorer", levelAt: "Pathfinder" },
    { threshold: 500, levelBefore: "Pathfinder", levelAt: "Trailblazer" },
    { threshold: 1_000, levelBefore: "Trailblazer", levelAt: "Pioneer" },
    { threshold: 1_500, levelBefore: "Pioneer", levelAt: "Innovator" },
    { threshold: 2_500, levelBefore: "Innovator", levelAt: "Architect" },
    { threshold: 5_000, levelBefore: "Architect", levelAt: "Visionary" },
    { threshold: 7_500, levelBefore: "Visionary", levelAt: "Luminary" },
    { threshold: 10_000, levelBefore: "Luminary", levelAt: "Vanguard" },
    { threshold: 15_000, levelBefore: "Vanguard", levelAt: "Legacy Builder" },
  ];

  for (const { threshold, levelBefore, levelAt } of levels) {
    const before = getExperienceXpProgress(threshold - 1);
    assert.equal(before.level, levelBefore);
    assert.equal(before.xpToNextLevel, 1);
    assert.equal(before.levelProgress, 99);

    const at = getExperienceXpProgress(threshold);
    assert.equal(at.level, levelAt);
    assert.equal(at.levelProgress, levelAt === "Legacy Builder" ? 100 : 0);
    assert.equal(at.nextLevelXp === null, levelAt === "Legacy Builder");
  }
});

test("Legacy Builder is the maximum level and has no next-level target", () => {
  assert.deepEqual(getExperienceXpProgress(15_000), {
    level: "Legacy Builder",
    levelProgress: 100,
    nextLevelXp: null,
    xpToNextLevel: null,
  });
  assert.equal(getExperienceXpProgress(20_000).levelProgress, 100);
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
    balanceXp: 249,
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
  assert.equal(summary.balanceXp, 249);
});
