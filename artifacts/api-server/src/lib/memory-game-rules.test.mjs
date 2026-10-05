import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseAstronautIndices,
  evaluateMemoryGameSelection,
  MEMORY_GAME_LEVELS,
} from "./memory-game-rules.mjs";

test("memory game uses the seven specified levels and recall times", () => {
  assert.deepEqual(
    MEMORY_GAME_LEVELS.map(({ rows, columns, astronautCount, memorizationMs }) => [
      rows,
      columns,
      astronautCount,
      memorizationMs,
    ]),
    [
      [3, 3, 3, 5000],
      [3, 3, 4, 5000],
      [3, 3, 5, 4000],
      [4, 3, 5, 4000],
      [4, 3, 6, 3500],
      [4, 4, 7, 3000],
      [4, 4, 8, 3000],
    ],
  );
});

test("astronaut positions are unique, sorted, and remain inside the grid", () => {
  let sample = 0;
  const positions = chooseAstronautIndices(16, 8, (maxExclusive) => {
    const value = sample % maxExclusive;
    sample += 1;
    return value;
  });

  assert.equal(positions.length, 8);
  assert.equal(new Set(positions).size, 8);
  assert.ok(positions.every((index) => index >= 0 && index < 16));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test("memory game only succeeds when every astronaut tile and no empty tile is selected", () => {
  const expected = [1, 4, 7];

  assert.deepEqual(evaluateMemoryGameSelection(expected, [1, 4, 7]), {
    successful: true,
    correctSelections: 3,
    totalSelections: 3,
  });
  assert.deepEqual(evaluateMemoryGameSelection(expected, [1, 4]), {
    successful: false,
    correctSelections: 2,
    totalSelections: 3,
  });
  assert.deepEqual(evaluateMemoryGameSelection(expected, [1, 4, 8]), {
    successful: false,
    correctSelections: 2,
    totalSelections: 3,
  });
});

test("astronaut positions reject invalid grid sizes", () => {
  assert.throws(() => chooseAstronautIndices(0, 1, () => 0), RangeError);
  assert.throws(() => chooseAstronautIndices(3, 4, () => 0), RangeError);
});
