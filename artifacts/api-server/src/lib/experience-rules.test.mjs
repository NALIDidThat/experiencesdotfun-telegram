import assert from "node:assert/strict";
import test from "node:test";
import {
  canJoinOrWaitlist,
  canCancelParticipation,
  isExperienceCancellationDateUpcoming,
  canMarkAttendance,
  canSubmitCompletion,
  isExperienceJoinable,
  participationStatusForCapacity,
  isValidExperienceSchedule,
} from "./experience-rules.ts";

test("only published experiences can be joined", () => {
  assert.equal(isExperienceJoinable("published"), true);
  assert.equal(isExperienceJoinable("full"), false);
  assert.equal(isExperienceJoinable("completed"), false);
  assert.equal(isExperienceJoinable("archived"), false);
});

test("published and full experiences can accept a join or waitlist request", () => {
  assert.equal(canJoinOrWaitlist("published"), true);
  assert.equal(canJoinOrWaitlist("full"), true);
  assert.equal(canJoinOrWaitlist("completed"), false);
  assert.equal(canJoinOrWaitlist("archived"), false);
  assert.equal(canJoinOrWaitlist("cancelled"), false);
});

test("capacity determines whether a new request gets a place or waits", () => {
  assert.equal(participationStatusForCapacity(2, 3), "joined");
  assert.equal(participationStatusForCapacity(3, 3), "waitlisted");
  assert.equal(participationStatusForCapacity(4, 3), "waitlisted");
});

test("attendance can only be marked from the joined state", () => {
  assert.equal(canMarkAttendance("joined"), true);
  assert.equal(canMarkAttendance("attended"), false);
  assert.equal(canMarkAttendance("submitted"), false);
  assert.equal(canMarkAttendance("verified"), false);
  assert.equal(canMarkAttendance("rejected"), false);
});

test("a rejected completion can be resubmitted, but pending or verified ones cannot", () => {
  assert.equal(canSubmitCompletion("joined"), true);
  assert.equal(canSubmitCompletion("attended"), true);
  assert.equal(canSubmitCompletion("rejected"), true);
  assert.equal(canSubmitCompletion("submitted"), false);
  assert.equal(canSubmitCompletion("verified"), false);
});

function cleanJoinedParticipation(overrides = {}) {
  return {
    status: "joined",
    attendedAt: null,
    submittedAt: null,
    completionStatement: null,
    evidenceObjectKeys: [],
    submissionVersion: 0,
    verifiedAt: null,
    reviewReason: null,
    reviewedByUserId: null,
    reviewedAt: null,
    rewardStatus: "pending",
    ...overrides,
  };
}

test("only a joined registration with no attendance or contribution activity can be cancelled", () => {
  assert.equal(canCancelParticipation(cleanJoinedParticipation(), false, false), true);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ status: "attended" }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ status: "rejected" }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ status: "waitlisted" }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ submittedAt: new Date() }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ completionStatement: "I completed the work." }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ verifiedAt: new Date() }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ evidenceObjectKeys: ["private/evidence"] }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ submissionVersion: 1 }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ reviewReason: "Needs a change." }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ reviewedByUserId: 99 }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ reviewedAt: new Date() }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation({ rewardStatus: "issued" }), false, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation(), true, false), false);
  assert.equal(canCancelParticipation(cleanJoinedParticipation(), false, true), false);
});

test("cancellation is limited to valid experience dates after today", () => {
  const today = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(isExperienceCancellationDateUpcoming("2026-11-01", today), true);
  assert.equal(isExperienceCancellationDateUpcoming("2026-10-31", today), false);
  assert.equal(isExperienceCancellationDateUpcoming("2026-10-30", today), false);
  assert.equal(isExperienceCancellationDateUpcoming("2026-02-30", today), false);
});

test("accepts a real date and a forward same-day schedule", () => {
  assert.equal(isValidExperienceSchedule("2026-09-28", "10:00", "13:00"), true);
});

test("rejects impossible dates and non-ISO date strings", () => {
  assert.equal(isValidExperienceSchedule("2026-02-30", "10:00", "13:00"), false);
  assert.equal(isValidExperienceSchedule("28/09/2026", "10:00", "13:00"), false);
});

test("rejects invalid, equal, and reversed times", () => {
  assert.equal(isValidExperienceSchedule("2026-09-28", "25:00", "26:00"), false);
  assert.equal(isValidExperienceSchedule("2026-09-28", "10:00", "10:00"), false);
  assert.equal(isValidExperienceSchedule("2026-09-28", "13:00", "10:00"), false);
});