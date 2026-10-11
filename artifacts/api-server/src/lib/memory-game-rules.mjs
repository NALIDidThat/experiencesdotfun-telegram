export const MAX_MEMORY_GAME_LEVEL = 100;
export const MEMORY_GAME_LEVELS = Object.freeze(
  Array.from({ length: MAX_MEMORY_GAME_LEVEL }, (_, index) => {
    const level = index + 1;
    const astronautCount = 3 + Math.floor((level - 1) * 0.7);
    const targetTileCount = Math.min(100, Math.max(9, Math.ceil(astronautCount * 1.7)));
    const columns = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(targetTileCount))));
    const rows = Math.min(10, Math.max(3, Math.ceil(targetTileCount / columns)));
    return {
      rows,
      columns,
      astronautCount: Math.min(astronautCount, rows * columns - 1),
      memorizationMs: level <= 5 ? 3000 : 5000,
    };
  }),
);

export function getDailyMemoryXpAward(dailyAwarded) {
  return Math.min(5, Math.max(0, 50 - Math.max(0, Math.floor(dailyAwarded))));
}

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
