import assert from "node:assert/strict";
import test from "node:test";
import { formatSol } from "./format-sol.mjs";

test("keeps one-lamport contributions visible", () => {
  assert.equal(formatSol("0.000000001"), "0.000000001");
  assert.equal(formatSol(0.000000001), "0.000000001");
});

test("trims unnecessary decimal zeroes without rounding SOL strings", () => {
  assert.equal(formatSol("0.100000000"), "0.1");
  assert.equal(formatSol("0.000010000"), "0.00001");
  assert.equal(formatSol("100.000000000"), "100");
});

test("uses a safe zero for invalid values", () => {
  assert.equal(formatSol("not-an-amount"), "0");
  assert.equal(formatSol(Number.NaN), "0");
});
