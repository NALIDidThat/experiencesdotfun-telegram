import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canCreateFeedComment,
  canCreateFeedPost,
  isSelfReportedAccountabilityEvent,
} from "./feed-policy.ts";

test("feed posting limits reject the threshold and invalid counts", () => {
  assert.equal(canCreateFeedPost(0), true);
  assert.equal(canCreateFeedPost(9), true);
  assert.equal(canCreateFeedPost(10), false);
  assert.equal(canCreateFeedPost(Number.NaN), false);
});

test("feed comment limits reject the threshold and invalid counts", () => {
  assert.equal(canCreateFeedComment(0), true);
  assert.equal(canCreateFeedComment(9), true);
  assert.equal(canCreateFeedComment(10), false);
  assert.equal(canCreateFeedComment(Number.POSITIVE_INFINITY), false);
});

test("accountability events are identified as self-reported", () => {
  assert.equal(isSelfReportedAccountabilityEvent("accountability_checkin"), true);
  assert.equal(isSelfReportedAccountabilityEvent("accountability_goal_completed"), true);
  assert.equal(isSelfReportedAccountabilityEvent("experience_verified"), false);
});
