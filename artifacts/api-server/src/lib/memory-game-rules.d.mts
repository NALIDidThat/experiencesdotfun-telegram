export interface MemoryGameLevel {
  rows: number;
  columns: number;
  astronautCount: number;
  memorizationMs: number;
}

export const MEMORY_GAME_LEVELS: readonly MemoryGameLevel[];

export function chooseAstronautIndices(
  tileCount: number,
  astronautCount: number,
  sampleInt: (maxExclusive: number) => number,
): number[];

export function evaluateMemoryGameSelection(
  expectedIndices: number[],
  selectedIndices: number[],
): {
  successful: boolean;
  correctSelections: number;
  totalSelections: number;
};
