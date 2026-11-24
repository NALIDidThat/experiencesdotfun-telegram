import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { PoppinsText as Text } from '@/components/Typography';
import { Feather } from '@expo/vector-icons';
import {
  getGetMyProgressionQueryKey,
  useGetMyXpAwards,
  useGetMyProgression,
  useListExperienceChallenges,
  useListMyParticipations,
  useRedeemMyXpAwards,
  type ExperienceChallenge,
  type Participation,
  type XpAward,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { HorizontalScrollWithCue } from '@/components/HorizontalScrollWithCue';
import { KeyboardAccessiblePressable } from '@/components/KeyboardAccessiblePressable';
import { ProfilePosts } from '@/components/ProfilePosts';
import { PersonalMemoriesPanel, SavedExperiencesPanel } from '@/components/PersonalCollections';
import { LearningLibraryPanel } from '@/components/LearningDashboardScreen';
import { PersonalRouteActivityPanel } from '@/components/PersonalRouteActivityPanel';
import { ExperienceXpProgressSummary } from '@/components/ExperienceXpProgressSummary';

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
  xpAmount?: number;
};

type Props = {
  profileId: number;
  initialSection?: 'activity' | 'route-activities' | 'journeys';
  initialRouteActivityId?: number;
  onCreatePersonalRoute: () => void;
  onOpenExperience: (experienceId: number) => void;
  onOpenChallenges: () => void;
  onExplore: () => void;
  onOpenLearning: () => void;
  onOpenJourneys: () => void;
  onOpenLearningDeck: (deckId: number) => void;
  onCreateCardsFromResearch: (researchId: number) => void;
};

type PersonalSection = 'activity' | 'route-activities' | 'saved-experiences' | 'learning' | 'journeys' | 'memories' | 'posts';

const personalSections: Array<{ key: PersonalSection; label: string }> = [
  { key: 'activity', label: 'Activity' },
  { key: 'route-activities', label: 'Routes' },
  { key: 'saved-experiences', label: 'Saved experiences' },
  { key: 'learning', label: 'Learning' },
  { key: 'journeys', label: 'Journeys' },
  { key: 'memories', label: 'Memories' },
  { key: 'posts', label: 'Posts' },
];

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
    xpAmount: award.amount,
  };
}

function activityTimeLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function queryCount(isLoading: boolean, isError: boolean, count: number | undefined) {
  if (isLoading && count === undefined) return '–';
  if (isError && count === undefined) return '!';
  return String(count ?? 0);
}

export function PersonalActivityScreen({
  profileId,
  initialSection = 'activity',
  initialRouteActivityId,
  onCreatePersonalRoute,
  onOpenExperience,
  onOpenChallenges,
  onExplore,
  onOpenLearning,
  onOpenJourneys,
  onOpenLearningDeck,
  onCreateCardsFromResearch,
}: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [section, setSection] = useState<PersonalSection>(initialSection);
  const participationsQuery = useListMyParticipations();
  const challengesQuery = useListExperienceChallenges();
  const xpQuery = useGetMyXpAwards();
  const progressionQuery = useGetMyProgression({
    query: {
      queryKey: [...getGetMyProgressionQueryKey(), profileId],
      enabled: section === 'activity',
      staleTime: 30_000,
      refetchOnMount: 'always',
    },
  });
  const redeemXp = useRedeemMyXpAwards({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries();
      },
    },
  });

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
  const isInitialLoading = participationsQuery.isLoading
    && challengesQuery.isLoading
    && xpQuery.isLoading
    && (section !== 'activity' || progressionQuery.isLoading);
  const isRefreshing = participationsQuery.isRefetching
    || challengesQuery.isRefetching
    || xpQuery.isRefetching
    || progressionQuery.isRefetching;
  const hasQueryError = participationsQuery.isError
    || challengesQuery.isError
    || xpQuery.isError
    || (section === 'activity' && progressionQuery.isError);

  const retryAll = () => {
    void Promise.all([
      participationsQuery.refetch(),
      challengesQuery.refetch(),
      xpQuery.refetch(),
      ...(section === 'activity' ? [progressionQuery.refetch()] : []),
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
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={96}
        refreshControl={section === 'activity' ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={retryAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined}
      >
        <HorizontalScrollWithCue
          accessibilityLabel="Personal Activity sections"
          testID="personal-record-tabs"
          style={styles.sectionTabsScroll}
          contentContainerStyle={styles.sectionTabs}
        >
          {personalSections.map((item) => {
            const selected = section === item.key;
            return (
              <KeyboardAccessiblePressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.label}`}
                accessibilityState={{ selected }}
                aria-pressed={selected}
                testID={`personal-record-tab-${item.key}`}
                onPress={() => setSection(item.key)}
                style={[
                  styles.sectionTab,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.sectionTabText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>
                  {item.label}
                </Text>
              </KeyboardAccessiblePressable>
            );
          })}
        </HorizontalScrollWithCue>

        {section === 'activity' ? (
          <>
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
        </View>

        <View
          testID="activity-xp-progression"
          style={[
            styles.xpProgressCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
          ]}
        >
          {progressionQuery.isLoading ? (
            <View style={styles.xpProgressState}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading Experience XP progress…</Text>
            </View>
          ) : progressionQuery.isError || !progressionQuery.data ? (
            <View style={styles.xpProgressState}>
              <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive }]}>
                Experience XP progress could not load. Your balance and rewards are unchanged.
              </Text>
              <Pressable
                accessibilityRole="button"
                testID="activity-xp-progression-retry"
                onPress={() => { void progressionQuery.refetch(); }}
              >
                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ExperienceXpProgressSummary
                testID="activity-xp-summary"
                level={progressionQuery.data.level}
                balanceXp={progressionQuery.data.balanceXp}
                levelProgress={progressionQuery.data.levelProgress}
                nextLevelXp={progressionQuery.data.nextLevelXp}
                xpToNextLevel={progressionQuery.data.xpToNextLevel}
                pendingXp={progressionQuery.data.pendingXp}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={progressionQuery.data.nextAction.label}
                testID="activity-xp-next-action"
                disabled={redeemXp.isPending}
                onPress={() => {
                  if (progressionQuery.data?.nextAction.kind === 'redeem_xp') {
                    redeemXp.mutate();
                  } else {
                    onExplore();
                  }
                }}
                style={({ pressed }) => [
                  styles.xpNextAction,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius,
                    opacity: redeemXp.isPending ? 0.55 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                {redeemXp.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather
                    name={progressionQuery.data.nextAction.kind === 'redeem_xp' ? 'zap' : 'compass'}
                    size={15}
                    color={colors.primaryForeground}
                  />
                )}
                <Text style={[styles.xpNextActionText, { color: colors.primaryForeground }]}>
                  {redeemXp.isPending ? 'Redeeming…' : progressionQuery.data.nextAction.label}
                </Text>
              </Pressable>
              {redeemXp.isError ? (
                <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive }]}>
                  XP could not be redeemed. Try again from your profile.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.sectionHeading}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your timeline</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              A record of your participation and progress.
            </Text>
          </View>
          <View style={[styles.itemCountBadge, { backgroundColor: colors.muted }]}>
            <Feather name="layers" size={12} color={colors.mutedForeground} />
            <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
              {filteredItems.length} {filteredItems.length === 1 ? 'RECORD' : 'RECORDS'}
            </Text>
          </View>
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
            {filteredItems.map((item, index) => {
              const iconColor = item.kind === 'xp' ? colors.primary : toneColor(item.tone);
              const isNavigable = item.kind !== 'xp';
              const kindLabel = item.kind === 'experiences'
                ? 'EXPERIENCE'
                : item.kind === 'challenges'
                  ? 'CHALLENGE'
                  : 'XP REWARD';
              const statusIcon = item.tone === 'success'
                ? 'check-circle'
                : item.tone === 'primary'
                  ? 'clock'
                  : item.tone === 'destructive'
                    ? 'alert-circle'
                    : 'circle';
              const timeLabel = activityTimeLabel(item.occurredAt);
              return (
                <View key={item.key} style={styles.timelineRow}>
                  <View style={styles.timelineRail} pointerEvents="none">
                    {index < filteredItems.length - 1 ? (
                      <View style={[styles.timelineConnector, { backgroundColor: colors.border }]} />
                    ) : null}
                    <View
                      style={[
                        styles.timelineNode,
                        { backgroundColor: iconColor, borderColor: colors.background },
                      ]}
                    />
                  </View>
                  <View
                    testID={`activity-entry-${item.key}`}
                    style={[
                      styles.entryCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderRadius: colors.radius + 4,
                      },
                    ]}
                  >
                    <Pressable
                      accessibilityRole={isNavigable ? 'button' : undefined}
                      accessibilityLabel={`${item.title}. ${item.status}.${item.xpAmount !== undefined ? ` ${item.xpAmount} XP.` : ''} ${activityDateLabel(item.occurredAt)}.`}
                      accessibilityHint={item.kind === 'challenges' ? 'Opens your challenges' : item.kind === 'experiences' ? 'Opens experience details' : undefined}
                      disabled={!isNavigable}
                      onPress={() => openItem(item)}
                      style={({ pressed }) => [styles.entryMain, { opacity: pressed && isNavigable ? 0.72 : 1 }]}
                    >
                      <View style={[styles.entryIcon, { backgroundColor: iconColor + '15' }]}>
                        <Feather name={item.icon} size={18} color={iconColor} />
                      </View>
                      <View style={styles.entryCopy}>
                        <View style={styles.entryTopline}>
                          <View style={[styles.activityTypePill, { backgroundColor: colors.muted }]}>
                            <Text style={[styles.activityTypeText, { color: colors.mutedForeground }]}>
                              {kindLabel}
                            </Text>
                          </View>
                          {item.xpAmount !== undefined ? (
                            <View style={[styles.xpAmountPill, { backgroundColor: colors.primary + '12' }]}>
                              <Text style={[styles.xpAmountText, { color: colors.primary }]}>
                                +{item.xpAmount} XP
                              </Text>
                            </View>
                          ) : null}
                          {isNavigable ? (
                            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                          ) : null}
                        </View>
                        <Text numberOfLines={2} style={[styles.entryTitle, { color: colors.foreground }]}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={2} style={[styles.entryDetail, { color: colors.mutedForeground }]}>
                          {item.detail}
                        </Text>
                        <View style={styles.entryMeta}>
                          <View style={[styles.statusPill, { backgroundColor: toneColor(item.tone) + '12' }]}>
                            <Feather name={statusIcon} size={12} color={toneColor(item.tone)} />
                            <Text numberOfLines={1} style={[styles.statusText, { color: toneColor(item.tone) }]}>
                              {item.status}
                            </Text>
                          </View>
                          <View style={styles.dateMeta}>
                            <Feather name="calendar" size={12} color={colors.mutedForeground} />
                            <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
                              {activityDateLabel(item.occurredAt)}
                            </Text>
                            {timeLabel ? (
                              <Text style={[styles.entryTime, { color: colors.mutedForeground }]}>
                                · {timeLabel}
                              </Text>
                            ) : null}
                          </View>
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
          <View style={[styles.emptyCard, styles.compactEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="filter" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, styles.compactEmptyTitle, { color: colors.foreground }]}>No {filter === 'xp' ? 'XP' : filter} activity yet</Text>
            <Text style={[styles.emptyCopy, styles.compactEmptyCopy, { color: colors.mutedForeground }]}>
              Try another filter to see more of your record.
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyCard, styles.compactEmptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Feather name="compass" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, styles.compactEmptyTitle, { color: colors.foreground }]}>Your record starts with a first step</Text>
            <Text style={[styles.emptyCopy, styles.compactEmptyCopy, { color: colors.mutedForeground }]}>
              Join an experience or take on a challenge. Your participation will appear here.
            </Text>
            {!progressionQuery.data ? (
              <Pressable
                accessibilityRole="button"
                testID="activity-explore"
                onPress={onExplore}
                style={[styles.exploreButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
              >
                <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Explore experiences</Text>
                <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
              </Pressable>
            ) : null}
          </View>
        )}
          </>
        ) : section === 'saved-experiences' ? (
          <SavedExperiencesPanel profileId={profileId} onOpenExperience={onOpenExperience} onExplore={onExplore} />
        ) : section === 'learning' ? (
          <LearningLibraryPanel
            onOpenLearning={onOpenLearning}
            onStudyDeck={onOpenLearningDeck}
            onCreateDeckFromResearch={onCreateCardsFromResearch}
          />
        ) : section === 'journeys' ? (
          <View style={[styles.emptyCard, styles.journeyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '12' }]}>
              <Feather name="map" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Build progress one verified step at a time</Text>
            <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
              Enrol in an organisation programme and track verified experiences and milestones separately from saved learning links.
            </Text>
            <Pressable
              accessibilityRole="button"
              testID="activity-open-journeys"
              onPress={onOpenJourneys}
              style={[styles.exploreButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Explore programmes</Text>
              <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
            </Pressable>
          </View>
        ) : section === 'memories' ? (
          <PersonalMemoriesPanel profileId={profileId} />
        ) : section === 'route-activities' ? (
          <PersonalRouteActivityPanel
            initialActivityId={initialRouteActivityId}
            onCreateRoute={onCreatePersonalRoute}
          />
        ) : (
          <ProfilePosts profileId={profileId} />
        )}
      </KeyboardAwareScrollViewCompat>
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
  scroll: { flex: 1, minHeight: 0 },
  content: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 70 : 14,
    paddingBottom: Platform.OS === 'web' ? 100 : 110,
  },
  sectionTabsScroll: { height: 52, flexGrow: 0, flexShrink: 0 },
  sectionTabs: { height: 52, alignItems: 'center', gap: 7, paddingBottom: 0 },
  sectionTab: { height: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 18 },
  sectionTabText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  header: { marginBottom: 19 },
  kicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4, maxWidth: 350 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  summaryCard: { width: '30.5%', minHeight: 94, borderWidth: 1, padding: 12 },
  summaryIcon: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  summaryValue: { fontSize: 21, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  sectionCaption: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  itemCountBadge: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 9 },
  itemCount: { fontSize: 9, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  filterRow: { gap: 7, paddingBottom: 12 },
  filterChip: { minHeight: 36, paddingHorizontal: 13, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 10 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  retryText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  xpProgressCard: { gap: 9, borderWidth: 1, padding: 12, marginBottom: 24 },
  xpProgressState: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  xpNextAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  xpNextActionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 9, paddingBottom: 12 },
  timelineRail: { width: 16, alignItems: 'center', position: 'relative' },
  timelineNode: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 16, zIndex: 1 },
  timelineConnector: { position: 'absolute', top: 29, bottom: -12, left: 7, width: 2, borderRadius: 1 },
  entryCard: { flex: 1, minWidth: 0, borderWidth: 1, overflow: 'hidden' },
  entryMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14 },
  entryIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  entryCopy: { flex: 1, minWidth: 0 },
  entryTopline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  activityTypePill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  activityTypeText: { fontSize: 8, letterSpacing: 0.65, fontFamily: 'Inter_700Bold' },
  xpAmountPill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  xpAmountText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  entryTitle: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, fontFamily: 'Inter_700Bold' },
  entryDetail: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  statusPill: { maxWidth: '100%', minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  dateMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entryDate: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  entryTime: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  experienceLink: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 59 },
  experienceLinkText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyCard: { minHeight: 210, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 24 },
  compactEmptyCard: { minHeight: 132, borderRadius: 16, padding: 16 },
  emptyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  emptyTitle: { fontSize: 16, textAlign: 'center', fontFamily: 'Inter_700Bold', marginTop: 8 },
  compactEmptyTitle: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  emptyCopy: { maxWidth: 275, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 6 },
  compactEmptyCopy: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  journeyCard: { minHeight: 230, marginTop: 4 },
  exploreButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', marginTop: 12, paddingHorizontal: 12 },
  exploreButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});