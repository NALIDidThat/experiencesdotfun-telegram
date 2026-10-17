import type { ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Experience } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type ExperienceManagementCardProps = {
  item: Experience;
  statusLabel: string;
  dateTimeLabel: string;
  rewardLabel: string;
  accessibilityLabel: string;
  testID: string;
  artwork: ReactNode;
  onPress: () => void;
};

export function ExperienceManagementCard({
  item,
  statusLabel,
  dateTimeLabel,
  rewardLabel,
  accessibilityLabel,
  testID,
  artwork,
  onPress,
}: ExperienceManagementCardProps) {
  const colors = useColors();
  const capacity = Math.max(0, item.capacity);
  const filledPlaces = capacity > 0
    ? Math.min(100, Math.round((item.participantCount / capacity) * 100))
    : 0;
  const statusColor = item.status === 'published'
    ? colors.success
    : item.status === 'full'
      ? colors.secondary
      : colors.mutedForeground;
  const availabilityLabel = item.availablePlaces === 0
    ? 'Full'
    : `${item.availablePlaces} left`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens experience management."
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius + 2,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[styles.artwork, { backgroundColor: colors.muted }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {artwork}
        </View>
        <View style={[styles.statusPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text numberOfLines={1} style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
          <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
        </View>

        <View style={styles.metaLine}>
          <Feather name="map-pin" size={12} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={[styles.metaText, { color: colors.mutedForeground }]}>{item.location}, {item.city}</Text>
        </View>

        <View style={styles.capacityRow}>
          <View style={styles.capacityCopy}>
            <Feather name="users" size={12} color={colors.secondary} />
            <Text style={[styles.capacityCount, { color: colors.foreground }]}>{item.participantCount} / {capacity || '—'}</Text>
          </View>
          <Text style={[styles.availability, { color: item.availablePlaces === 0 ? colors.primary : colors.mutedForeground }]}>{availabilityLabel}</Text>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`${filledPlaces}% of places filled`}
          accessibilityValue={{ min: 0, max: 100, now: filledPlaces }}
          style={[styles.progressTrack, { backgroundColor: colors.border }]}
        >
          <View style={[styles.progressFill, { width: `${filledPlaces}%`, backgroundColor: colors.primary }]} />
        </View>

        <View style={styles.dateLine}>
          <Feather name="calendar" size={12} color={colors.mutedForeground} />
          <Text numberOfLines={1} style={[styles.metaText, styles.dateText, { color: colors.mutedForeground }]}>{dateTimeLabel}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.reward}>
            <Feather name="award" size={13} color={colors.secondary} />
            <Text numberOfLines={1} style={[styles.rewardText, { color: colors.secondary }]}>{rewardLabel}</Text>
          </View>
          <View style={[styles.manageButton, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.manageText, { color: colors.primary }]}>Manage</Text>
            <Feather name="arrow-right" size={13} color={colors.primary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 148,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    borderWidth: 1,
    padding: 7,
    marginBottom: 10,
    overflow: 'hidden',
  },
  artwork: {
    width: '32%',
    minWidth: 86,
    maxWidth: 112,
    minHeight: 132,
    alignSelf: 'stretch',
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 12,
  },
  statusPill: {
    position: 'absolute',
    top: 7,
    left: 7,
    maxWidth: '90%',
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 999,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  content: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingRight: 3,
  },
  titleRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 3,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
  },
  metaLine: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_400Regular',
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  capacityCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  capacityCount: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  availability: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 999,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  dateLine: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    fontFamily: 'Inter_500Medium',
  },
  footer: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  reward: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rewardText: {
    flexShrink: 1,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  manageButton: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  manageText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
});
