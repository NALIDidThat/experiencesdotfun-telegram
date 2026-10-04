import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useGetMyXpAwards,
  useListExperienceChallenges,
  useListMyParticipations,
  type ExperienceChallenge,
  type Participation,
  type XpAward,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type ActivityFilter = 'all' | 'experiences' | 'challenges' | 'xp';
type ActivityKind = Exclude<ActivityFilter, 'all'>;
type ActivityTone = 'success' | 'primary' | 'muted' | 'destructive';
type ActivityIcon = keyof typeof Feather.glyphMap;

type ActivityItem = {
  key: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  occurredAt: string;
  status: string;
  tone: ActivityTone;
  icon: ActivityIcon;
  experienceId?: number;
  challengeId?: number;
};

type Props = {
  onOpenExperience: (experienceId: number) => void;
  onOpenChallenges: () => void;
  onExplore: () => void;
};

const filters: Array<{ key: ActivityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'xp', label: 'XP' },
];

function participationActivityDate(participation: Participation) {
  if (participation.status === 'verified') {
    return participation.verifiedAt ?? participation.experience.date;
  }
  if (participation.status === 'submitted') {
    return participation.submittedAt ?? participation.joinedAt;
  }
  if (participation.status === 'attended') {
    return participation.attendedAt ?? participation.joinedAt;
  }
  return participation.joinedAt;
}

function participationStatus(participation: Participation): { label: string; tone: ActivityTone } {
  switch (participation.status) {
    case 'verified':
      return { label: 'Contribution verified', tone: 'success' };
    case 'submitted':
      return { label: 'Awaiting verification', tone: 'primary' };
    case 'attended':
      return { label: 'Attendance recorded', tone: 'success' };
    case 'rejected':
      return { label: 'Completion not verified', tone: 'destructive' };
    case 'waitlisted':
      return { label: 'Waitlisted', tone: 'muted' };
    default:
      return { label: 'Joined', tone: 'muted' };
  }
}

function challengeActivityDate(challenge: ExperienceChallenge) {
  return challenge.completedAt ?? challenge.acceptedAt ?? challenge.createdAt;
}

function challengeStatus(challenge: ExperienceChallenge): { label: string; tone: ActivityTone } {
  switch (challenge.status) {
    case 'completed':
      return { label: 'Completed', tone: 'success' };
    case 'accepted':
      return { label: 'Accepted', tone: 'primary' };
    case 'declined':
      return { label: 'Declined', tone: 'muted' };
    default:
      return {
        label: challenge.direction === 'incoming' ? 'Response needed' : 'Awaiting response',
        tone: 'muted',
      };
  }
}

function activityDateLabel(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function participationItem(participation: Participation): ActivityItem {
  const status = participationStatus(participation);
  return {
    key: `experience-${participation.id}`,
    kind: 'experiences',
    title: participation.experience.title,
    detail: `Experience · ${participation.experience.city}`,
    occurredAt: participationActivityDate(participation),
    status: status.label,
    tone: status.tone,
    icon: 'calendar',
    experienceId: participation.experience.id,
  };
}

function challengeItem(challenge: ExperienceChallenge): ActivityItem {
  const status = challengeStatus(challenge);
  const otherPerson = challenge.direction === 'incoming' ? challenge.challenger : challenge.challenged;
  return {
    key: `challenge-${challenge.id}`,
    kind: 'challenges',
    title: challenge.experienceTitle,
    detail: `${challenge.direction === 'incoming' ? 'Challenge from' : 'Challenge to'} ${otherPerson.name} · ${challenge.experienceCity}`,
    occurredAt: challengeActivityDate(challenge),
    status: status.label,
    tone: status.tone,
    icon: 'users',
    experienceId: challenge.experienceId,
    challengeId: challenge.id,
  };
}

function awardItem(award: XpAward): ActivityItem {
  return {
    key: `xp-${award.id}`,
    kind: 'xp',
    title: award.title,
    detail: award.sourceType === 'legacy_balance' ? 'XP balance adjustment' : 'Experience points',
    occurredAt: award.awardedAt,
    status: award.status === 'pending' ? 'Pending redemption' : 'Added to your balance',
    tone: award.status === 'pending' ? 'primary' : 'success',
    icon: 'zap',
  };
}

function queryCount(isLoading: boolean, isError: boolean, count: number | undefined) {
  if (isLoading && count === undefined) return '–';
  if (isError && count === undefined) return '!';
  return String(count ?? 0);
}

export function PersonalActivityScreen({ onOpenExperience, onOpenChallenges, onExplore }: Props) {
  const colors = useColors();
  const participationsQuery = useListMyParticipations();
  const challengesQuery = useListExperienceChallenges();
  const xpQuery = useGetMyXpAwards();
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const items = useMemo(() => {
    const participationItems = (participationsQuery.data ?? []).map(participationItem);
    const challengeItems = (challengesQuery.data ?? []).map(challengeItem);
    const awardItems = (xpQuery.data?.awards ?? []).map(awardItem);
    return [...participationItems, ...challengeItems, ...awardItems].sort(
      (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    );
  }, [challengesQuery.data, participationsQuery.data, xpQuery.data?.awards]);

  const filteredItems = filter === 'all'
    ? items
    : items.filter((item) => item.kind === filter);
  const verifiedCount = participationsQuery.data?.filter((item) => item.status === 'verified').length;
  const isInitialLoading = participationsQuery.isLoading && challengesQuery.isLoading && xpQuery.isLoading;
  const isRefreshing = participationsQuery.isRefetching || challengesQuery.isRefetching || xpQuery.isRefetching;
  const hasQueryError = participationsQuery.isError || challengesQuery.isError || xpQuery.isError;

  const retryAll = () => {
    void Promise.all([
      participationsQuery.refetch(),
      challengesQuery.refetch(),
      xpQuery.refetch(),
    ]);
  };

  const openItem = (item: ActivityItem) => {
    if (item.kind === 'challenges') {
      onOpenChallenges();
      return;
    }
    if (item.experienceId) onOpenExperience(item.experienceId);
  };

  const toneColor = (tone: ActivityTone) => {
    if (tone === 'success') return colors.success;
    if (tone === 'primary') return colors.primary;
    if (tone === 'destructive') return colors.destructive;
    return colors.mutedForeground;
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={retryAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.primary }]}>YOUR PERSONAL RECORD</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Experiences you’ve joined, challenges you’ve shared, and XP you’ve earned.
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <SummaryCard
            icon="calendar"
            label="Experiences"
            value={queryCount(participationsQuery.isLoading, participationsQuery.isError, participationsQuery.data?.length)}
            colors={colors}
          />
          <SummaryCard
            icon="check-circle"
            label="Verified"
            value={queryCount(participationsQuery.isLoading, participationsQuery.isError, verifiedCount)}
            colors={colors}
          />
          <SummaryCard
            icon="users"
            label="Challenges"
            value={queryCount(challengesQuery.isLoading, challengesQuery.isError, challengesQuery.data?.length)}
            colors={colors}
          />
          <SummaryCard
            icon="zap"
            label="XP balance"
            value={queryCount(xpQuery.isLoading, xpQuery.isError, xpQuery.data?.balanceXp)}
            colors={colors}
          />
        </View>

        <View style={styles.sectionHeading}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your timeline</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              A record of your participation and progress.
            </Text>
          </View>
          <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
            {filteredItems.length}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filters.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`activity-filter-${item.key}`}
                onPress={() => setFilter(item.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[
                  styles.filterText,
                  { color: selected ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {hasQueryError ? (
          <View
            accessibilityRole="alert"
            style={[styles.errorCard, { backgroundColor: colors.destructive + '10', borderColor: colors.destructive + '35' }]}
          >
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              Some of your activity couldn’t be loaded. Pull down to try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="activity-retry"
              onPress={retryAll}
              hitSlop={8}
            >
              <Text style={[styles.retryText, { color: colors.destructive }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {isInitialLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading your activity…</Text>
          </View>
        ) : filteredItems.length ? (
          <View style={styles.timeline}>
            {filteredItems.map((item) => {
              const iconColor = item.kind === 'xp' ? colors.primary : toneColor(item.tone);
              const isNavigable = item.kind !== 'xp';
              return (
                <View
                  key={item.key}
                  testID={`activity-entry-${item.key}`}
                  style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
                >
                  <Pressable
                    accessibilityRole={isNavigable ? 'button' : undefined}
                    accessibilityLabel={`${item.title}. ${item.status}. ${activityDateLabel(item.occurredAt)}.`}
                    accessibilityHint={item.kind === 'challenges' ? 'Opens your challenges' : item.kind === 'experiences' ? 'Opens experience details' : undefined}
                    disabled={!isNavigable}
                    onPress={() => openItem(item)}
                    style={({ pressed }) => [styles.entryMain, { opacity: pressed && isNavigable ? 0.72 : 1 }]}
                  >
                    <View style={[styles.entryIcon, { backgroundColor: iconColor + '15' }]}>
                      <Feather name={item.icon} size={17} color={iconColor} />
                    </View>
                    <View style={styles.entryCopy}>
                      <View style={styles.entryTopline}>
                        <Text numberOfLines={2} style={[styles.entryTitle, { color: colors.foreground }]}>
                          {item.title}
                        </Text>
                        {isNavigable ? <Feather name="chevron-right" size={17} color={colors.mutedForeground} /> : null}
                      </View>
                      <Text numberOfLines={1} style={[styles.entryDetail, { color: colors.mutedForeground }]}>
                        {item.detail}
                      </Text>
                      <View style={styles.entryMeta}>
                        <View style={[styles.statusPill, { backgroundColor: toneColor(item.tone) + '15' }]}>
                          <Text numberOfLines={1} style={[styles.statusText, { color: toneColor(item.tone) }]}>
                            {item.status}
                          </Text>
                        </View>
                        <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
                          {activityDateLabel(item.occurredAt)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  {item.kind === 'challenges' && item.experienceId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View experience ${item.title}`}
                      testID={`activity-open-experience-${item.experienceId}`}
                      onPress={() => onOpenExperience(item.experienceId!)}
                      style={[styles.experienceLink, { borderTopColor: colors.border }]}
                    >
                      <Text style={[styles.experienceLinkText, { color: colors.primary }]}>View experience</Text>
                      <Feather name="arrow-up-right" size={14} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : hasQueryError ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="activity" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Activity isn’t available yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              Try again once your connection is back.
            </Text>
          </View>
        ) : items.length ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="filter" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing in this section yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              Choose another filter to see more of your activity.
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Feather name="compass" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your story starts with a first step</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              Join an experience or invite a friend. Your activity and progress will be collected here.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="activity-explore"
              onPress={onExplore}
              style={[styles.exploreButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Explore experiences</Text>
              <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  colors,
}: {
  icon: ActivityIcon;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  content: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 70 : 14,
    paddingBottom: Platform.OS === 'web' ? 100 : 110,
  },
  header: { marginBottom: 19 },
  kicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4, maxWidth: 350 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  summaryCard: { width: '48.5%', minHeight: 94, borderWidth: 1, padding: 12 },
  summaryIcon: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  summaryValue: { fontSize: 21, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  sectionCaption: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  itemCount: { minWidth: 28, textAlign: 'right', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  filterRow: { gap: 7, paddingBottom: 12 },
  filterChip: { minHeight: 36, paddingHorizontal: 13, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 10 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  timeline: { gap: 9 },
  entryCard: { borderWidth: 1, overflow: 'hidden' },
  entryMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 13 },
  entryIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  entryCopy: { flex: 1, minWidth: 0 },
  entryTopline: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  entryTitle: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  entryDetail: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  statusPill: { maxWidth: '70%', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  entryDate: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  experienceLink: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 59 },
  experienceLinkText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyCard: { minHeight: 210, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, textAlign: 'center', fontFamily: 'Inter_700Bold', marginTop: 8 },
  emptyCopy: { maxWidth: 275, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 6 },
  exploreButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 17, paddingHorizontal: 12 },
  exploreButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});