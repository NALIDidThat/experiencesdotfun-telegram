import assert from "node:assert/strict";
import test from "node:test";
import {
  canMarkAttendance,
  isExperienceJoinable,
  isValidExperienceSchedule,
} from "./experience-rules.ts";

test("only published experiences can be joined", () => {
  assert.equal(isExperienceJoinable("published"), true);
  assert.equal(isExperienceJoinable("full"), false);
  assert.equal(isExperienceJoinable("completed"), false);
  assert.equal(isExperienceJoinable("archived"), false);
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