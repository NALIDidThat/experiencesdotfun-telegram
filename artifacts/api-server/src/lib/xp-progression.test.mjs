import assert from "node:assert/strict";
import test from "node:test";
import { getExperienceXpProgress } from "./xp-progression.mjs";

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
