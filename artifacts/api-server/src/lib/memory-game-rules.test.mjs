import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseAstronautIndices,
  evaluateMemoryGameSelection,
  getDailyMemoryXpAward,
  MEMORY_GAME_LEVELS,
  MAX_MEMORY_GAME_LEVEL,
} from "./memory-game-rules.mjs";

test("memory game has 100 bounded levels with the requested recall times", () => {
  assert.equal(MAX_MEMORY_GAME_LEVEL, 100);
  assert.equal(MEMORY_GAME_LEVELS.length, 100);
  for (const [index, level] of MEMORY_GAME_LEVELS.entries()) {
    assert.equal(level.memorizationMs, index < 5 ? 3000 : 5000);
    assert.ok(level.rows >= 3 && level.rows <= 10);
    assert.ok(level.columns >= 3 && level.columns <= 10);
    assert.ok(level.astronautCount > 0 && level.astronautCount < level.rows * level.columns);
  }
});

test("official Memory Game XP stops at 50 for the day without changing score progression", () => {
  assert.equal(getDailyMemoryXpAward(0), 5);
  assert.equal(getDailyMemoryXpAward(45), 5);
  assert.equal(getDailyMemoryXpAward(48), 2);
  assert.equal(getDailyMemoryXpAward(50), 0);
  assert.equal(getDailyMemoryXpAward(55), 0);
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
