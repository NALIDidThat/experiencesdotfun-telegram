import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveJourneyProgress,
  canManageJourneyProgramme,
  canReadJourneyEnrolment,
  getJourneyProgrammeMetrics,
  journeyStepCompletionDedupeKey,
  nextJourneyEnrolmentStatus,
} from "./journey-progress-rules.mjs";

test("journey progress follows only verified step evidence and preserves ordered resource links", () => {
  const steps = [
    { id: 10, kind: "experience" },
    { id: 11, kind: "resource" },
    { id: 12, kind: "milestone" },
  ];
  const progress = deriveJourneyProgress(steps, new Map([
    [10, { id: 101, verifiedAt: new Date("2026-11-24T12:00:00Z") }],
  ]));
  assert.deepEqual(progress.steps.map(({ stepId, status }) => ({ stepId, status })), [
    { stepId: 10, status: "complete" },
    { stepId: 11, status: "resource" },
    { stepId: 12, status: "incomplete" },
  ]);
  assert.equal(progress.completedSteps, 1);
  assert.equal(progress.eligibleSteps, 2);
  assert.equal(progress.completionPercent, 50);
  assert.equal(progress.isComplete, false);
});

test("resource-only programmes never become complete or count as learning completion", () => {
  const progress = deriveJourneyProgress([
    { id: 1, kind: "resource" },
    { id: 2, kind: "resource" },
  ], new Map());
  assert.equal(progress.eligibleSteps, 0);
  assert.equal(progress.completionPercent, 0);
  assert.equal(progress.isComplete, false);
});

test("duplicate verified source events do not change one step's completion count", () => {
  const evidence = new Map([
    [1, { id: 44, verifiedAt: "2026-11-24T12:00:00Z" }],
  ]);
  const first = deriveJourneyProgress([{ id: 1, kind: "experience" }], evidence);
  const repeated = deriveJourneyProgress([{ id: 1, kind: "experience" }], evidence);
  assert.deepEqual(repeated, first);
  assert.equal(repeated.completedSteps, 1);
  assert.equal(repeated.isComplete, true);
});

test("programme completion metrics exclude withdrawn participants from the rate", () => {
  assert.deepEqual(getJourneyProgrammeMetrics([
    { status: "active" },
    { status: "completed" },
    { status: "withdrawn" },
  ]), {
    activeParticipants: 1,
    completedParticipants: 1,
    withdrawnParticipants: 1,
    completionRatePercent: 50,
  });
});

test("a completed progress snapshot completes only an active enrolment", () => {
  const complete = { isComplete: true };
  assert.equal(nextJourneyEnrolmentStatus("active", complete), "completed");
  assert.equal(nextJourneyEnrolmentStatus("withdrawn", complete), "withdrawn");
  assert.equal(nextJourneyEnrolmentStatus("completed", { isComplete: false }), "completed");
});

test("verified progress audit keys stay unique per enrolment and step across source retries", () => {
  const key = journeyStepCompletionDedupeKey(8, 4);
  assert.equal(journeyStepCompletionDedupeKey(8, 4), key);
  assert.notEqual(journeyStepCompletionDedupeKey(9, 4), key);
  assert.notEqual(journeyStepCompletionDedupeKey(8, 5), key);
});

test("programme and participant progress permissions stay bound to the matching account", () => {
  assert.equal(canManageJourneyProgramme("organisation", 12, 12), true);
  assert.equal(canManageJourneyProgramme("organisation", 12, 13), false);
  assert.equal(canManageJourneyProgramme("participant", 12, 12), false);
  assert.equal(canManageJourneyProgramme("organisation", null, 12), false);

  assert.equal(canReadJourneyEnrolment("participant", 44, 44), true);
  assert.equal(canReadJourneyEnrolment("participant", 44, 45), false);
  assert.equal(canReadJourneyEnrolment("organisation", 44, 44), false);
});
