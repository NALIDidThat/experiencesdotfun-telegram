const EXPERIENCE_XP_LEVELS = [
  { minimumXp: 0, label: "Explorer" },
  { minimumXp: 500, label: "Contributor" },
  { minimumXp: 1_500, label: "Champion" },
  { minimumXp: 2_500, label: "Leader" },
  { minimumXp: 5_000, label: "Legend" },
];

export function getExperienceXpProgress(xp) {
  const normalizedXp = Number.isFinite(xp)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(xp)))
    : 0;
  const currentIndex = EXPERIENCE_XP_LEVELS.reduce(
    (selected, level, index) => (normalizedXp >= level.minimumXp ? index : selected),
    0,
  );
  const current = EXPERIENCE_XP_LEVELS[currentIndex];
  const next = EXPERIENCE_XP_LEVELS[currentIndex + 1] ?? null;

  return {
    level: current.label,
    levelProgress: next
      ? Math.max(
          0,
          Math.min(
            99,
            Math.floor(
              ((normalizedXp - current.minimumXp) /
                (next.minimumXp - current.minimumXp)) *
                100,
            ),
          ),
        )
      : 100,
    nextLevelXp: next?.minimumXp ?? null,
    xpToNextLevel: next ? Math.max(0, next.minimumXp - normalizedXp) : null,
  };
}
