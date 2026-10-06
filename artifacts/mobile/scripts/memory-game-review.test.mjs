import assert from "node:assert/strict";
import test from "node:test";
import { getMemoryGameTileOutcome } from "../lib/memory-game-review.ts";

test("answer review distinguishes correct, missed, extra, and untouched tiles", () => {
  const correctTileIndices = [1, 4, 6];
  const selectedIndices = [1, 3, 6];

  assert.equal(getMemoryGameTileOutcome(1, correctTileIndices, selectedIndices), "correct");
  assert.equal(getMemoryGameTileOutcome(4, correctTileIndices, selectedIndices), "missed");
  assert.equal(getMemoryGameTileOutcome(3, correctTileIndices, selectedIndices), "extra");
  assert.equal(getMemoryGameTileOutcome(5, correctTileIndices, selectedIndices), "empty");
});

test("answer review handles an empty pattern and an empty selection", () => {
  assert.equal(getMemoryGameTileOutcome(0, [], []), "empty");
});
