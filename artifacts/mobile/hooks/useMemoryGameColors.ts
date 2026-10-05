import { useColors } from '@/hooks/useColors';

export function useMemoryGameColors() {
  const colors = useColors();

  return {
    ...colors,
    welcome: {
      ...colors.welcome,
      background: colors.background,
      foreground: colors.foreground,
      muted: colors.mutedForeground,
      subdued: colors.mutedForeground,
      surface: colors.card,
      border: colors.border,
      gold: colors.accent,
      error: colors.destructive,
    },
  };
}
