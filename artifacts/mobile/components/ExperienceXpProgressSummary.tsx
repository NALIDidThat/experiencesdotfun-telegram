import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PoppinsText as Text } from '@/components/Typography';
import { useColors } from '@/hooks/useColors';

type Props = {
  level: string;
  balanceXp: number;
  levelProgress: number;
  nextLevelXp: number | null;
  xpToNextLevel: number | null;
  pendingXp?: number;
  pendingState?: 'loading' | 'error' | 'ready';
  testID?: string;
};

export function ExperienceXpProgressSummary({
  level,
  balanceXp,
  levelProgress,
  nextLevelXp,
  xpToNextLevel,
  pendingXp,
  pendingState = 'ready',
  testID = 'experience-xp-progress-summary',
}: Props) {
  const colors = useColors();
  const progressLabel = nextLevelXp === null
    ? 'Highest level reached'
    : `${xpToNextLevel?.toLocaleString() ?? 0} XP to next level`;
  const pendingLabel = pendingState === 'loading'
    ? 'Checking pending XP…'
    : pendingState === 'error'
      ? 'Pending XP could not load'
      : pendingXp === undefined
        ? null
        : `${pendingXp.toLocaleString()} XP pending redemption`;

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>EXPERIENCE XP</Text>
          <Text style={[styles.level, { color: colors.foreground }]}>{level}</Text>
        </View>
        <Text style={[styles.balance, { color: colors.primary }]}>
          {balanceXp.toLocaleString()} XP
          <Text style={[styles.balanceCaption, { color: colors.mutedForeground }]}> credited</Text>
        </Text>
      </View>
      <View style={styles.progressCopy}>
        <Text style={[styles.progressLabel, { color: colors.foreground }]}>{progressLabel}</Text>
        {nextLevelXp !== null ? (
          <Text style={[styles.progressPercent, { color: colors.mutedForeground }]}>{levelProgress}%</Text>
        ) : null}
      </View>
      {nextLevelXp !== null ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${level} Experience XP progress`}
          accessibilityValue={{ min: 0, max: 100, now: levelProgress }}
          style={[styles.progressTrack, { backgroundColor: colors.border }]}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(0, Math.min(100, levelProgress))}%`, backgroundColor: colors.primary },
            ]}
          />
        </View>
      ) : null}
      {pendingLabel ? (
        <Text
          testID={`${testID}-pending`}
          accessibilityRole={pendingState === 'error' ? 'alert' : undefined}
          style={[styles.pending, { color: pendingState === 'error' ? colors.destructive : colors.mutedForeground }]}
        >
          {pendingLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 13, gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  level: { fontSize: 16, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  balance: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  balanceCaption: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  progressCopy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progressLabel: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  progressPercent: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  pending: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
});
