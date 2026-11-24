import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetMyProgressionQueryKey,
  getGetMyXpLeagueQueryKey,
  useGetMyProgression,
  useGetMyXpLeague,
  useUpdateMyXpLeagueOptIn,
  type ExperienceCategory,
  type XpLeagueResponse,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PoppinsText as Text } from '@/components/Typography';
import { useColors } from '@/hooks/useColors';
import { ExperienceXpProgressSummary } from '@/components/ExperienceXpProgressSummary';

const CATEGORIES: Array<{ key: ExperienceCategory; label: string }> = [
  { key: 'environmental', label: 'Environmental' },
  { key: 'education', label: 'Education' },
  { key: 'community', label: 'Community' },
];
const PAGE_SIZE = 8;

function divisionName(division: number) {
  return ['Bronze', 'Silver', 'Gold'][division - 1] ?? 'Bronze';
}

function dateRange(weekStart: string, weekEnd: string) {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  const lastDay = new Date(new Date(`${weekEnd}T12:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000);
  const format = (date: Date) => date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${format(start)} – ${format(lastDay)} UTC`;
}

function weekLabel(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function divisionMovement(movement: string) {
  if (movement === 'promoted') return 'Moved up';
  if (movement === 'demoted') return 'Moved down';
  return 'Stayed';
}

export function ExperienceXpLeaguePanel() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<ExperienceCategory>('environmental');
  const [page, setPage] = useState(1);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const params = { category, page, pageSize: PAGE_SIZE };
  const progression = useGetMyProgression({
    query: {
      queryKey: getGetMyProgressionQueryKey(),
      staleTime: 30_000,
      refetchOnMount: 'always',
    },
  });
  const league = useGetMyXpLeague(params, {
    query: {
      queryKey: getGetMyXpLeagueQueryKey(params),
      refetchInterval: 30_000,
      retry: 1,
    },
  });
  const updateOptIn = useUpdateMyXpLeagueOptIn({
    mutation: {
      onSuccess: async () => {
        setConfirmingLeave(false);
        setPage(1);
        await queryClient.invalidateQueries({ queryKey: getGetMyXpLeagueQueryKey() });
      },
    },
  });
  const data: XpLeagueResponse | undefined = league.data;
  const mutationError = updateOptIn.error as
    | { data?: { message?: unknown } }
    | undefined;
  const mutationMessage = typeof mutationError?.data?.message === 'string'
    ? mutationError.data.message
    : 'Your league setting could not be updated. Try again.';

  const selectCategory = (nextCategory: ExperienceCategory) => {
    setCategory(nextCategory);
    setPage(1);
    setConfirmingLeave(false);
  };
  const setOptIn = (enabled: boolean) => {
    setConfirmingLeave(false);
    updateOptIn.mutate({ data: { category, enabled } });
  };

  return (
    <View
      testID="experience-xp-leagues"
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
        <View style={[styles.icon, { backgroundColor: colors.primary + '14' }]}>
          <Feather name="award" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WEEKLY EXPERIENCE XP</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Category leagues</Text>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Compete with verified Experience XP. Community XP and Memory Game scores stay separate.
      </Text>
      {progression.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Loading your overall Experience XP…</Text>
        </View>
      ) : progression.isError || !progression.data ? (
        <View style={styles.state}>
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
            Overall Experience XP progress could not load. League results are separate.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="xp-league-progression-retry"
            onPress={() => { void progression.refetch(); }}
            style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ExperienceXpProgressSummary
          testID="xp-league-progress-summary"
          level={progression.data.level}
          balanceXp={progression.data.balanceXp}
          levelProgress={progression.data.levelProgress}
          nextLevelXp={progression.data.nextLevelXp}
          xpToNextLevel={progression.data.xpToNextLevel}
          pendingXp={progression.data.pendingXp}
        />
      )}

      <View style={styles.categoryRow} accessibilityLabel="Experience XP league categories">
        {CATEGORIES.map((item) => {
          const selected = item.key === category;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} league`}
              accessibilityState={{ selected }}
              testID={`xp-league-category-${item.key}`}
              onPress={() => selectCategory(item.key)}
              style={({ pressed }) => [
                styles.categoryButton,
                {
                  backgroundColor: selected ? colors.primary : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.categoryText,
                  { color: selected ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {league.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Loading this league…</Text>
        </View>
      ) : league.isError ? (
        <View style={styles.state}>
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
            Weekly league data is unavailable right now. Your XP is unchanged.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="xp-league-retry"
            onPress={() => { void league.refetch(); }}
            style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : data && !data.optedIn ? (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            Join the {CATEGORIES.find((item) => item.key === category)?.label} league
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Opt in to appear on this category's ranking. Your score starts when you join. Only verified Experience XP counts.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Join the ${category} Experience XP league`}
            accessibilityState={{ disabled: updateOptIn.isPending }}
            testID="xp-league-join"
            disabled={updateOptIn.isPending}
            onPress={() => setOptIn(true)}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius - 4,
                opacity: updateOptIn.isPending ? 0.55 : pressed ? 0.78 : 1,
              },
            ]}
          >
            {updateOptIn.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="log-in" size={16} color={colors.primaryForeground} />
            )}
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              {updateOptIn.isPending ? 'Joining…' : 'Join this league'}
            </Text>
          </Pressable>
          {updateOptIn.isError ? (
            <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
              {mutationMessage}
            </Text>
          ) : null}
        </View>
      ) : data ? (
        <View style={styles.content}>
          <View style={[styles.weekCard, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
            <View style={styles.weekHeading}>
              <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>THIS WEEK</Text>
              <Text style={[styles.division, { color: colors.primary }]}>
                {divisionName(data.division ?? 1)} league
              </Text>
            </View>
            <Text style={[styles.weekDates, { color: colors.foreground }]}>
              {dateRange(data.weekStart, data.weekEnd)}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Your score uses the time each host verifies your activity.
            </Text>
            <View style={[styles.standing, { borderTopColor: colors.border }]}>
              <View style={styles.standingMetric}>
                <Text style={[styles.standingValue, { color: colors.primary }]}>
                  {data.currentStanding ? `#${data.currentStanding.rank}` : '—'}
                </Text>
                <Text style={[styles.standingLabel, { color: colors.mutedForeground }]}>Your place</Text>
              </View>
              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
              <View style={styles.standingMetric}>
                <Text style={[styles.standingValue, { color: colors.foreground }]}>
                  {data.currentStanding?.scoreXp ?? 0}
                </Text>
                <Text style={[styles.standingLabel, { color: colors.mutedForeground }]}>XP this week</Text>
              </View>
              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
              <View style={styles.standingMetric}>
                <Text style={[styles.standingValue, { color: colors.foreground }]}>{data.total}</Text>
                <Text style={[styles.standingLabel, { color: colors.mutedForeground }]}>In your league</Text>
              </View>
            </View>
            {data.currentStanding ? (
              <Text testID="xp-league-next-rank-progress" style={[styles.progress, { color: colors.mutedForeground }]}>
                {data.currentStanding.xpToNextRank === null
                  ? "You're at the top of this division."
                  : `${data.currentStanding.xpToNextRank} verified XP to move up to #${data.currentStanding.rank - 1}.`}
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>League ranking</Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
              {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </Text>
          </View>
          {data.members.length ? data.members.map((member) => (
            <View
              key={member.userId}
              testID={`xp-league-member-${member.rank}`}
              style={[
                styles.memberRow,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: member.isCurrentUser ? colors.primary + '0D' : 'transparent',
                },
              ]}
            >
              <Text style={[styles.memberRank, { color: member.isCurrentUser ? colors.primary : colors.mutedForeground }]}>
                #{member.rank}
              </Text>
              <View style={[styles.memberAvatar, { backgroundColor: member.isCurrentUser ? colors.primary : colors.muted }]}>
                <Text style={[styles.memberInitial, { color: member.isCurrentUser ? colors.primaryForeground : colors.primary }]}>
                  {(member.isCurrentUser ? 'Y' : member.name.charAt(0)).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <Text numberOfLines={1} style={[styles.memberName, { color: colors.foreground }]}>
                  {member.isCurrentUser ? 'You' : member.name}
                </Text>
                <Text numberOfLines={1} style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                  {member.isCurrentUser ? 'Your profile' : member.username ? `@${member.username}` : 'Participant'}
                </Text>
              </View>
              <Text style={[styles.memberScore, { color: member.isCurrentUser ? colors.primary : colors.foreground }]}>
                {member.scoreXp} XP
              </Text>
            </View>
          )) : (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              No one has earned verified XP in this league this week yet.
            </Text>
          )}
          <View style={styles.pagination}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous league page"
              testID="xp-league-previous-page"
              disabled={page <= 1}
              onPress={() => setPage((value) => Math.max(1, value - 1))}
              style={({ pressed }) => [styles.pageButton, { opacity: page <= 1 ? 0.35 : pressed ? 0.6 : 1 }]}
            >
              <Feather name="chevron-left" size={17} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>Previous</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next league page"
              testID="xp-league-next-page"
              disabled={!data.hasMore}
              onPress={() => setPage((value) => value + 1)}
              style={({ pressed }) => [styles.pageButton, { opacity: !data.hasMore ? 0.35 : pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.actionText, { color: colors.primary }]}>Next</Text>
              <Feather name="chevron-right" size={17} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.history}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent league history</Text>
            {data.history.length ? data.history.slice(0, 5).map((item) => (
              <View key={item.weekStart} testID={`xp-league-history-${item.weekStart}`} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.historyIcon, { backgroundColor: colors.secondary + '14' }]}>
                  <Feather name={item.movement === 'promoted' ? 'trending-up' : item.movement === 'demoted' ? 'trending-down' : 'minus'} size={15} color={colors.secondary} />
                </View>
                <View style={styles.memberCopy}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>
                    {weekLabel(item.weekStart)} · #{item.rank}
                  </Text>
                  <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                    {divisionName(item.division)} · {divisionMovement(item.movement)}
                  </Text>
                </View>
                <Text style={[styles.memberScore, { color: colors.foreground }]}>{item.scoreXp} XP</Text>
              </View>
            )) : (
              <Text style={[styles.body, { color: colors.mutedForeground }]}>
                Your first finished week will appear here.
              </Text>
            )}
          </View>

          <Text style={[styles.rules, { color: colors.mutedForeground }]}>
            {data.rules.tieBreak} {data.rules.movement}
          </Text>
          {confirmingLeave ? (
            <View style={[styles.confirmBox, { backgroundColor: colors.muted, borderRadius: colors.radius - 4 }]}>
              <Text style={[styles.body, { color: colors.foreground }]}>
                Leaving removes your saved history for this category. You can join again later in Bronze.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  testID="xp-league-cancel-leave"
                  onPress={() => setConfirmingLeave(false)}
                  style={styles.textButton}
                >
                  <Text style={[styles.actionText, { color: colors.foreground }]}>Stay joined</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="xp-league-confirm-leave"
                  disabled={updateOptIn.isPending}
                  onPress={() => setOptIn(false)}
                  style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.65 : 1 }]}
                >
                  <Text style={[styles.actionText, { color: colors.destructive }]}>
                    {updateOptIn.isPending ? 'Leaving…' : 'Leave league'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              testID="xp-league-leave"
              onPress={() => setConfirmingLeave(true)}
              style={({ pressed }) => [styles.leaveButton, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="log-out" size={14} color={colors.mutedForeground} />
              <Text style={[styles.leaveText, { color: colors.mutedForeground }]}>Leave this category league</Text>
            </Pressable>
          )}
          {updateOptIn.isError ? (
            <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
              {mutationMessage}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 14, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 17, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  description: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  categoryRow: { flexDirection: 'row', gap: 6 },
  categoryButton: { flex: 1, minHeight: 38, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, borderWidth: 1, borderRadius: 12 },
  categoryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8 },
  state: { alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  stateTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 42, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  content: { gap: 10 },
  weekCard: { padding: 12, gap: 4 },
  weekHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  division: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  weekDates: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  standing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 9 },
  standingMetric: { flex: 1, alignItems: 'center', gap: 2 },
  standingValue: { fontSize: 18, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  standingLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  progress: { fontSize: 10, lineHeight: 14, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 29 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  sectionMeta: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  memberRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  memberRank: { width: 26, fontSize: 10, fontFamily: 'Inter_700Bold' },
  memberAvatar: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  memberInitial: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  memberCopy: { flex: 1, minWidth: 0, gap: 2 },
  memberName: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  memberUsername: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  memberScore: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  pageButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5 },
  textButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6 },
  actionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  history: { gap: 4, paddingTop: 6 },
  historyRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 3 },
  historyIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rules: { fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  confirmBox: { padding: 10, gap: 4 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7 },
  leaveButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  leaveText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
