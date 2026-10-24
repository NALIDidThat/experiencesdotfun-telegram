import assert from "node:assert/strict";
import { test } from "node:test";
import { solToLamportsExact, validateFundMilestones } from "./fund-milestone-rules.mjs";

const checkpoint = (targetSol) => ({ title: "Garden supplies", outcome: "Buy soil and seeds for the garden.", targetSol });

test("SOL amounts are compared exactly to one lamport", () => {
  assert.equal(solToLamportsExact("2.000000001"), 2_000_000_001n);
  assert.equal(solToLamportsExact("0002.5"), 2_500_000_000n);
  assert.equal(solToLamportsExact("1.0000000001"), null);
});

test("campaign milestones are optional and accept increasing targets within the goal", () => {
  assert.equal(validateFundMilestones([], 5), null);
  assert.equal(validateFundMilestones([checkpoint("1.25"), checkpoint("5")], 5), null);
});

test("campaign milestones reject repeated or decreasing targets", () => {
  assert.match(
    validateFundMilestones([checkpoint("2"), checkpoint("2")], 5),
    /higher SOL target/,
  );
  assert.match(
    validateFundMilestones([checkpoint("3"), checkpoint("2")], 5),
    /higher SOL target/,
  );
});

test("campaign milestones cannot exceed the goal or use an invalid target", () => {
  assert.match(validateFundMilestones([checkpoint("5.000000001")], 5), /cannot exceed/);
  assert.match(validateFundMilestones([checkpoint("0")], 5), /positive SOL target/);
  assert.match(validateFundMilestones([checkpoint("1.0000000001")], 5), /positive SOL target/);
});

test("campaigns are limited to twelve milestones", () => {
  assert.match(validateFundMilestones(Array.from({ length: 13 }, (_, index) => checkpoint(String(index + 1))), 20), /no more than 12/);
});
