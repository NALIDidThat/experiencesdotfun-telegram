import assert from "node:assert/strict";
import test from "node:test";
import { resolveAccountabilityCommitmentScope } from "./accountability-goal-rules.ts";

test("a private goal can only create a personal commitment for its owner", () => {
  const goal = { ownerUserId: 10, partnershipId: null, visibility: "private" };
  assert.deepEqual(
    resolveAccountabilityCommitmentScope({
      userId: 10,
      assignedUserId: 10,
      partnerUserId: 20,
      partnershipId: 5,
      goal,
    }),
    { ok: true, scope: "personal", partnershipId: null },
  );
  assert.equal(
    resolveAccountabilityCommitmentScope({
      userId: 20,
      assignedUserId: 20,
      partnerUserId: 10,
      partnershipId: 5,
      goal,
    }).ok,
    false,
  );
  assert.equal(
    resolveAccountabilityCommitmentScope({
      userId: 10,
      assignedUserId: 20,
      partnerUserId: 20,
      partnershipId: 5,
      goal,
    }).ok,
    false,
  );
});

test("shared goals are available only inside their active partnership", () => {
  const goal = { ownerUserId: 10, partnershipId: 5, visibility: "shared" };
  assert.deepEqual(
    resolveAccountabilityCommitmentScope({
      userId: 20,
      assignedUserId: 10,
      partnerUserId: 10,
      partnershipId: 5,
      goal,
    }),
    { ok: true, scope: "shared", partnershipId: 5 },
  );
  assert.equal(
    resolveAccountabilityCommitmentScope({
      userId: 20,
      assignedUserId: 20,
      partnerUserId: null,
      partnershipId: null,
      goal,
    }).ok,
    false,
  );
});

test("commitments without a partnership remain bound to the signed-in profile", () => {
  assert.deepEqual(
    resolveAccountabilityCommitmentScope({
      userId: 10,
      assignedUserId: 10,
      partnerUserId: null,
      partnershipId: null,
      goal: null,
    }),
    { ok: true, scope: "personal", partnershipId: null },
  );
  assert.equal(
    resolveAccountabilityCommitmentScope({
      userId: 10,
      assignedUserId: 20,
      partnerUserId: null,
      partnershipId: null,
      goal: null,
    }).ok,
    false,
  );
});
