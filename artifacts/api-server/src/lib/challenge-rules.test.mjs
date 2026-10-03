import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptedChallengeStatus,
  canCreateExperienceChallenge,
  verifiedChallengeStatus,
} from "./challenge-rules.mjs";

test("only accepted participant friends can challenge each other to open experiences", () => {
  const valid = {
    challengerId: 10,
    friendId: 20,
    friendshipStatus: "accepted",
    challengerType: "participant",
    friendType: "participant",
    experienceStatus: "published",
  };

  assert.equal(canCreateExperienceChallenge(valid), true);
  assert.equal(canCreateExperienceChallenge({ ...valid, friendId: 10 }), false);
  assert.equal(canCreateExperienceChallenge({ ...valid, friendshipStatus: "pending" }), false);
  assert.equal(canCreateExperienceChallenge({ ...valid, friendType: "organisation" }), false);
  assert.equal(canCreateExperienceChallenge({ ...valid, experienceStatus: "cancelled" }), false);
});

test("acceptance completes only when the invited friend already has verified participation", () => {
  assert.equal(acceptedChallengeStatus("pending", false), "accepted");
  assert.equal(acceptedChallengeStatus("pending", true), "completed");
  assert.equal(acceptedChallengeStatus("declined", false), null);
});

test("only accepted challenges become complete after verified participation", () => {
  assert.equal(verifiedChallengeStatus("accepted"), "completed");
  assert.equal(verifiedChallengeStatus("pending"), "pending");
  assert.equal(verifiedChallengeStatus("declined"), "declined");
});