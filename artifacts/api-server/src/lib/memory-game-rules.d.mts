export interface MemoryGameLevel {
  rows: number;
  columns: number;
  astronautCount: number;
  memorizationMs: number;
}

export const MEMORY_GAME_LEVELS: readonly MemoryGameLevel[];
export const MAX_MEMORY_GAME_LEVEL: number;

export function getDailyMemoryXpAward(dailyAwarded: number): number;

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
