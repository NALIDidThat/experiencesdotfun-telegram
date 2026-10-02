import assert from "node:assert/strict";
import test from "node:test";
import {
  areAllMilestoneStatusesVerified,
  hasValidMilestoneRewardTotal,
  MAX_EXPERIENCE_MILESTONES,
} from "./experience-milestone-rules.mjs";

test("legacy experiences without configured milestones remain valid", () => {
  assert.equal(hasValidMilestoneRewardTotal(undefined, 150), true);
});

test("configured milestone XP must add up to the experience reward", () => {
  const milestones = [
    { title: "Prepare", xpReward: 40 },
    { title: "Take part", xpReward: 60 },
  ];
  assert.equal(hasValidMilestoneRewardTotal(milestones, 100), true);
  assert.equal(hasValidMilestoneRewardTotal(milestones, 99), false);
});

test("milestone XP totals must be non-negative whole numbers", () => {
  assert.equal(
    hasValidMilestoneRewardTotal([{ title: "Do the work", xpReward: 1.5 }], 1.5),
    false,
  );
  assert.equal(
    hasValidMilestoneRewardTotal([{ title: "Do the work", xpReward: -1 }], 0),
    false,
  );
});

test("configured experiences need between one and twelve milestones", () => {
  const milestone = { title: "Step", xpReward: 0 };
  assert.equal(hasValidMilestoneRewardTotal([], 0), false);
  assert.equal(
    hasValidMilestoneRewardTotal(
      Array.from({ length: MAX_EXPERIENCE_MILESTONES }, () => milestone),
      0,
    ),
    true,
  );
  assert.equal(
    hasValidMilestoneRewardTotal(
      Array.from({ length: MAX_EXPERIENCE_MILESTONES + 1 }, () => milestone),
      0,
    ),
    false,
  );
});

test("participation completes only after at least one milestone is verified and all are verified", () => {
  assert.equal(areAllMilestoneStatusesVerified([]), false);
  assert.equal(areAllMilestoneStatusesVerified(["verified"]), true);
  assert.equal(
    areAllMilestoneStatusesVerified(["verified", "submitted"]),
    false,
  );
});