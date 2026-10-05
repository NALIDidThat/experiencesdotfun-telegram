export const MEMORY_GAME_LEVELS = Object.freeze([
  { rows: 3, columns: 3, astronautCount: 3, memorizationMs: 5000 },
  { rows: 3, columns: 3, astronautCount: 4, memorizationMs: 5000 },
  { rows: 3, columns: 3, astronautCount: 5, memorizationMs: 4000 },
  { rows: 4, columns: 3, astronautCount: 5, memorizationMs: 4000 },
  { rows: 4, columns: 3, astronautCount: 6, memorizationMs: 3500 },
  { rows: 4, columns: 4, astronautCount: 7, memorizationMs: 3000 },
  { rows: 4, columns: 4, astronautCount: 8, memorizationMs: 3000 },
]);

/**
 * @param {number} tileCount
 * @param {number} astronautCount
 * @param {(maxExclusive: number) => number} sampleInt
 */
export function chooseAstronautIndices(tileCount, astronautCount, sampleInt) {
  if (
    !Number.isInteger(tileCount) ||
    !Number.isInteger(astronautCount) ||
    tileCount < 1 ||
    astronautCount < 1 ||
    astronautCount > tileCount
  ) {
    throw new RangeError("Astronaut count must fit within the game grid.");
  }

  const positions = Array.from({ length: tileCount }, (_, index) => index);
  for (let index = 0; index < astronautCount; index += 1) {
    const swapIndex = index + sampleInt(tileCount - index);
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }
  return positions.slice(0, astronautCount).sort((left, right) => left - right);
}

/**
 * @param {number[]} expectedIndices
 * @param {number[]} selectedIndices
 */
export function evaluateMemoryGameSelection(expectedIndices, selectedIndices) {
  const expected = new Set(expectedIndices);
  const selected = new Set(selectedIndices);
  const correctSelections = selectedIndices.reduce(
    (count, index) => count + (expected.has(index) ? 1 : 0),
    0,
  );

  return {
    successful:
      expected.size === selected.size &&
      [...expected].every((index) => selected.has(index)),
    correctSelections,
    totalSelections: Math.max(expected.size, selected.size),
  };
}
