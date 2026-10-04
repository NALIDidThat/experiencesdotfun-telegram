import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { HostExperience, HostOverview } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Props = {
  overview?: HostOverview;
  experiences?: HostExperience[];
  overviewIsLoading: boolean;
  overviewHasError: boolean;
  experiencesIsLoading: boolean;
  experiencesHaveError: boolean;
  onRetryOverview: () => void;
  onRetryExperiences: () => void;
  onOpenExperience: (experienceId: number) => void;
  onCreateExperience: () => void;
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusLabel(value: string) {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function RetryRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.retryRow}>
      <Text style={[styles.retryMessage, { color: colors.destructive }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.65 : 1 }]}
      >
        <Feather name="refresh-cw" size={13} color={colors.primary} />
        <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

export function OrganisationActivityDashboard({
  overview,
  experiences,
  overviewIsLoading,
  overviewHasError,
  experiencesIsLoading,
  experiencesHaveError,
  onRetryOverview,
  onRetryExperiences,
  onOpenExperience,
  onCreateExperience,
}: Props) {
  const colors = useColors();
  const valueFor = (value: number | undefined) => {
    if (overviewIsLoading) return '…';
    if (overviewHasError || value === undefined) return '—';
    return String(value);
  };
  const stats = [
    { key: 'experiences', label: 'Experiences', icon: 'briefcase' as const, value: overview?.totalExperiences },
    { key: 'upcoming', label: 'Upcoming', icon: 'calendar' as const, value: overview?.upcomingExperiences },
    { key: 'registrations', label: 'Registrations', icon: 'users' as const, value: overview?.participantCount },
    { key: 'waitlist', label: 'Waitlist', icon: 'clock' as const, value: overview?.waitlistCount },
  ];
  const recentExperiences = experiences?.slice(0, 3) ?? [];

  return (
    <View testID="organisation-activity-dashboard" style={styles.dashboard}>
      <View style={styles.heading}>
        <View style={[styles.headingIcon, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="activity" size={17} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Organisation activity</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Impact from the experiences your organisation runs.
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            testID={`organisation-activity-stat-${stat.key}`}
            style={[
              styles.statCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: colors.muted }]}>
                <Feather name={stat.icon} size={14} color={colors.primary} />
              </View>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{valueFor(stat.value)}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {overviewHasError ? (
        <RetryRow message="Your organisation totals couldn’t be loaded." onRetry={onRetryOverview} />
      ) : null}

      <View style={styles.recentHeading}>
        <View>
          <Text style={[styles.recentTitle, { color: colors.foreground }]}>Recent experiences</Text>
          <Text style={[styles.recentSubtitle, { color: colors.mutedForeground }]}>
            A record of your organisation’s hosted activity.
          </Text>
        </View>
        {experiencesIsLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      {experiencesHaveError ? (
        <RetryRow message="Recent organisation activity couldn’t be loaded." onRetry={onRetryExperiences} />
      ) : experiencesIsLoading ? (
        <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading hosted experiences…</Text>
        </View>
      ) : recentExperiences.length ? (
        <View style={styles.recentList}>
          {recentExperiences.map((experience) => {
            const statusColor = experience.status === 'completed'
              ? colors.success
              : experience.status === 'cancelled'
                ? colors.destructive
                : colors.primary;
            const meta = `${formatDate(experience.date)} · ${experience.city}`;
            return (
              <Pressable
                key={experience.id}
                testID={`organisation-activity-experience-${experience.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${experience.title}, ${statusLabel(experience.status)}, ${meta}, ${experience.participantCount} registrations, ${experience.waitlistCount} waitlisted`}
                accessibilityHint="Opens this hosted experience."
                onPress={() => onOpenExperience(experience.id)}
                style={({ pressed }) => [
                  styles.experienceCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.74 : 1,
                  },
                ]}
              >
                <View style={[styles.experienceIcon, { backgroundColor: statusColor + '12' }]}>
                  <Feather
                    name={experience.status === 'completed' ? 'check-circle' : 'calendar'}
                    size={16}
                    color={statusColor}
                  />
                </View>
                <View style={styles.experienceCopy}>
                  <Text numberOfLines={2} style={[styles.experienceTitle, { color: colors.foreground }]}>
                    {experience.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.experienceMeta, { color: colors.mutedForeground }]}>
                    {meta}
                  </Text>
                  <Text style={[styles.experienceEngagement, { color: colors.mutedForeground }]}>
                    {experience.participantCount} {experience.participantCount === 1 ? 'registration' : 'registrations'}
                    {experience.waitlistCount > 0 ? ` · ${experience.waitlistCount} waitlisted` : ''}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusColor + '12' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel(experience.status)}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
            <Feather name="briefcase" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your organisation’s story starts here</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Create an experience to start building your organisation activity record.
          </Text>
          <Pressable
            testID="organisation-activity-create"
            accessibilityRole="button"
            onPress={onCreateExperience}
            style={({ pressed }) => [
              styles.createButton,
              { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Feather name="plus" size={15} color={colors.primaryForeground} />
            <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Create experience</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dashboard: { gap: 13, marginBottom: 22 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, gap: 2 },
  title: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48.5%', minHeight: 76, borderWidth: 1, padding: 11, justifyContent: 'space-between' },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statIcon: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 20, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  retryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  retryMessage: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  retryButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recentHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  recentTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  recentSubtitle: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  recentList: { gap: 8 },
  experienceCard: { minHeight: 83, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, padding: 11, overflow: 'hidden' },
  experienceIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  experienceCopy: { flex: 1, minWidth: 0, gap: 2 },
  experienceTitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  experienceMeta: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  experienceEngagement: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  statusPill: { maxWidth: 75, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4 },
  statusText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  loadingCard: { minHeight: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderRadius: 14 },
  loadingText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  emptyCard: { alignItems: 'center', borderWidth: 1, padding: 17, gap: 8 },
  emptyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 13, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  emptyText: { maxWidth: 265, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  createButton: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, alignSelf: 'stretch', marginTop: 4 },
  createButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});