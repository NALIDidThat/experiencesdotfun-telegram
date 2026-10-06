export type MemoryGameTileOutcome = 'correct' | 'missed' | 'extra' | 'empty';

export function getMemoryGameTileOutcome(
  tileIndex: number,
  correctTileIndices: readonly number[],
  selectedIndices: readonly number[],
): MemoryGameTileOutcome {
  const isCorrectTile = correctTileIndices.includes(tileIndex);
  const isSelected = selectedIndices.includes(tileIndex);

  if (isCorrectTile && isSelected) return 'correct';
  if (isCorrectTile) return 'missed';
  if (isSelected) return 'extra';
  return 'empty';
}
