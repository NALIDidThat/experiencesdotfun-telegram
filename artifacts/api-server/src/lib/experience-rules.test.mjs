import assert from "node:assert/strict";
import test from "node:test";
import {
  canJoinOrWaitlist,
  canMarkAttendance,
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