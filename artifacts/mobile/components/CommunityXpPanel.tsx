import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  getGetCommunityDetailsQueryKey,
  getGetMyCommunitiesQueryKey,
  useGetCommunityDetails,
  useGetMyCommunities,
  type CommunityContribution,
  type CommunityLeaderboardMember,
  type CommunitySummary,
} from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

type IconName = keyof typeof Feather.glyphMap;

function formatContributionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function progressFraction(value: number) {
  return Math.max(0, Math.min(1, value / 100));
}

function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{children}</Text>;
}

function Skeleton({ style }: { style?: object }) {
  const colors = useColors();
  return <View style={[styles.skeleton, { backgroundColor: colors.muted }, style]} />;
}

function LoginState({ onLogin }: { onLogin: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.primary + '12' }]}>
        <Feather name="users" size={21} color={colors.primary} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Your community standing</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
        Log in to see the groups where you have earned Community XP. Your group reputation stays separate from Experience XP.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log in with Telegram to view Community XP"
        onPress={onLogin}
        style={({ pressed }) => [styles.stateButton, { backgroundColor: colors.primary, borderRadius: colors.radius - 5, opacity: pressed ? 0.78 : 1 }]}
      >
        <Feather name="send" size={16} color={colors.primaryForeground} />
        <Text style={[styles.stateButtonText, { color: colors.primaryForeground }]}>Log in with Telegram</Text>
      </Pressable>
    </View>
  );
}

function CommunityListSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.panelHeading}>
        <View style={styles.panelHeadingCopy}>
          <Skeleton style={{ width: 134, height: 11 }} />
          <Skeleton style={{ width: 224, height: 20, marginTop: 8 }} />
        </View>
        <Skeleton style={{ width: 28, height: 28, borderRadius: 14 }} />
      </View>
      <View style={styles.communityChipRow}>
        {[92, 128, 104].map((width, index) => <Skeleton key={index} style={{ width, height: 42, borderRadius: 14 }} />)}
      </View>
      <Skeleton style={{ width: '100%', height: 152, borderRadius: 18, marginTop: 16 }} />
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.destructive + '12' }]}>
        <Feather name="alert-circle" size={21} color={colors.destructive} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Community XP is taking a pause</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
        We could not reach your community ledger. Your profile is safe; try loading it again.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading communities"
        onPress={onRetry}
        style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border, borderRadius: colors.radius - 5, opacity: pressed ? 0.65 : 1 }]}
      >
        <Feather name="refresh-cw" size={16} color={colors.primary} />
        <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

function EmptyState() {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.secondary + '12' }]}>
        <Feather name="message-circle" size={21} color={colors.secondary} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>No community XP yet</Text>
      <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
        Join a Telegram group where the Experiences.fun bot is active. A normal message of at least seven words can earn Community XP, separate from Experience XP.
      </Text>
    </View>
  );
}

function CommunityPicker({
  communities,
  selectedChatId,
  onSelect,
}: {
  communities: CommunitySummary[];
  selectedChatId: string | null;
  onSelect: (chatId: string) => void;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.communityChipRow}
      accessibilityLabel="Communities with earned Community XP"
    >
      {communities.map((community) => {
        const selected = selectedChatId === community.chatId;
        return (
          <Pressable
            key={community.chatId}
            accessibilityRole="button"
            accessibilityLabel={`View Community XP for ${community.title}`}
            accessibilityState={{ selected }}
            onPress={() => onSelect(community.chatId)}
            style={({ pressed }) => [
              styles.communityChip,
              {
                backgroundColor: selected ? colors.primary : colors.background,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.74 : 1,
              },
            ]}
          >
            <View style={[styles.communityChipMark, { backgroundColor: selected ? colors.primaryForeground + '25' : colors.primary + '12' }]}>
              <Feather name="users" size={14} color={selected ? colors.primaryForeground : colors.primary} />
            </View>
            <View style={styles.communityChipCopy}>
              <Text numberOfLines={1} style={[styles.communityChipTitle, { color: selected ? colors.primaryForeground : colors.foreground }]}>{community.title}</Text>
              <Text style={[styles.communityChipMeta, { color: selected ? colors.primaryForeground + 'CC' : colors.mutedForeground }]}>{community.communityXp} XP</Text>
            </View>
            {selected ? <Feather name="check" size={15} color={colors.primaryForeground} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CommunityHero({ community }: { community: CommunitySummary }) {
  const colors = useColors();
  const fraction = progressFraction(community.levelProgress);
  const progressLabel = community.nextLevelXp === null
    ? 'Maximum level reached'
    : `${Math.round(community.levelProgress)}% to next level`;

  return (
    <View style={[styles.hero, { backgroundColor: colors.primary, borderRadius: colors.radius + 2 }]}>
      <View style={styles.heroTop}>
        <View style={styles.heroTitleCopy}>
          <Text style={[styles.heroEyebrow, { color: colors.primaryForeground + 'B8' }]}>COMMUNITY XP</Text>
          <Text numberOfLines={2} style={[styles.heroTitle, { color: colors.primaryForeground }]}>{community.title}</Text>
        </View>
        <View style={[styles.heroLevelBadge, { backgroundColor: colors.primaryForeground }]}>
          <Feather name="award" size={14} color={colors.primary} />
          <Text style={[styles.heroLevelText, { color: colors.primary }]}>{community.level}</Text>
        </View>
      </View>
      <View style={styles.heroScoreRow}>
        <Text style={[styles.heroScore, { color: colors.primaryForeground }]}>{community.communityXp}</Text>
        <Text style={[styles.heroScoreUnit, { color: colors.primaryForeground + 'C7' }]}>XP</Text>
        <View style={styles.heroRank}>
          <Feather name="trending-up" size={14} color={colors.primaryForeground} />
          <Text style={[styles.heroRankText, { color: colors.primaryForeground }]}>Rank #{community.rank}</Text>
        </View>
      </View>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: colors.primaryForeground + 'D1' }]}>Level progress</Text>
        <Text style={[styles.progressLabel, { color: colors.primaryForeground + 'D1' }]}>{progressLabel}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.primaryForeground + '35' }]}>
        <View style={[styles.progressFill, { width: `${Math.max(4, fraction * 100)}%`, backgroundColor: colors.primaryForeground }]} />
      </View>
      {community.nextLevelXp !== null ? (
        <Text style={[styles.nextLevel, { color: colors.primaryForeground + 'B8' }]}>Next level at {community.nextLevelXp} XP</Text>
      ) : null}
    </View>
  );
}

function CommunityStats({ community }: { community: CommunitySummary }) {
  const colors = useColors();
  const stats: Array<{ label: string; value: number; icon: IconName }> = [
    { label: 'Qualifying messages', value: community.qualifyingMessages, icon: 'message-circle' },
    { label: 'Contributions', value: community.contributionCount, icon: 'activity' },
  ];
  return (
    <View style={styles.statRow}>
      {stats.map((stat) => (
        <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.muted, borderRadius: colors.radius - 5 }]}>
          <View style={[styles.statIcon, { backgroundColor: colors.primary + '12' }]}>
            <Feather name={stat.icon} size={15} color={colors.primary} />
          </View>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

function LeaderboardRow({ member }: { member: CommunityLeaderboardMember }) {
  const colors = useColors();
  const displayName = member.isCurrentUser ? 'You' : member.name;
  return (
    <View style={[styles.leaderboardRow, { borderBottomColor: colors.border, backgroundColor: member.isCurrentUser ? colors.primary + '0D' : 'transparent' }]}>
      <Text style={[styles.leaderboardRank, { color: member.isCurrentUser ? colors.primary : colors.mutedForeground }]}>#{member.rank}</Text>
      <View style={[styles.leaderboardAvatar, { backgroundColor: member.isCurrentUser ? colors.primary : colors.muted }]}>
        <Text style={[styles.leaderboardInitial, { color: member.isCurrentUser ? colors.primaryForeground : colors.primary }]}>{displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.leaderboardCopy}>
        <View style={styles.leaderboardNameRow}>
          <Text numberOfLines={1} style={[styles.leaderboardName, { color: colors.foreground }]}>{displayName}</Text>
          {member.isCurrentUser ? <View style={[styles.youBadge, { backgroundColor: colors.primary }]}><Text style={[styles.youBadgeText, { color: colors.primaryForeground }]}>YOU</Text></View> : null}
        </View>
        <Text numberOfLines={1} style={[styles.leaderboardMeta, { color: colors.mutedForeground }]}>
          {member.username ? `@${member.username} · ` : ''}{member.level} · {member.qualifyingMessages} messages
        </Text>
      </View>
      <Text style={[styles.leaderboardXp, { color: member.isCurrentUser ? colors.primary : colors.foreground }]}>{member.communityXp} XP</Text>
    </View>
  );
}

function Leaderboard({ members }: { members: CommunityLeaderboardMember[] }) {
  const colors = useColors();
  const currentUser = members.find((member) => member.isCurrentUser);
  const topMembers = members.slice(0, 5);
  const currentAlreadyShown = topMembers.some((member) => member.isCurrentUser);
  const visibleMembers = currentUser && !currentAlreadyShown ? [...topMembers, currentUser] : topMembers;
  return (
    <View style={[styles.contentCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.contentCardHeader}>
        <View>
          <SectionLabel>COMMUNITY LEADERBOARD</SectionLabel>
          <Text style={[styles.contentCardTitle, { color: colors.foreground }]}>People showing up</Text>
        </View>
        <Feather name="bar-chart-2" size={20} color={colors.primary} />
      </View>
      {visibleMembers.length ? visibleMembers.map((member, index) => (
        <View key={`${member.rank}-${member.username ?? member.name}-${index}`}>
          {currentUser && !currentAlreadyShown && index === topMembers.length ? (
            <Text style={[styles.yourPlaceLabel, { color: colors.primary }]}>YOUR PLACE</Text>
          ) : null}
          <LeaderboardRow member={member} />
        </View>
      )) : (
        <Text style={[styles.inlineEmpty, { color: colors.mutedForeground }]}>The leaderboard is still gathering its first entries.</Text>
      )}
    </View>
  );
}

function ContributionHistory({ contributions }: { contributions: CommunityContribution[] }) {
  const colors = useColors();
  return (
    <View style={[styles.contentCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={styles.contentCardHeader}>
        <View>
          <SectionLabel>RECENT AWARDS</SectionLabel>
          <Text style={[styles.contentCardTitle, { color: colors.foreground }]}>Your community contributions</Text>
        </View>
        <Feather name="clock" size={20} color={colors.primary} />
      </View>
      {contributions.length ? contributions.slice(0, 6).map((contribution) => {
        const fromMessage = contribution.contributionType === 'telegram_message';
        return (
          <View key={contribution.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.historyIcon, { backgroundColor: fromMessage ? colors.teal + '15' : colors.secondary + '15' }]}>
              <Feather name={fromMessage ? 'message-circle' : 'award'} size={16} color={fromMessage ? colors.teal : colors.secondary} />
            </View>
            <View style={styles.historyCopy}>
              <Text style={[styles.historyTitle, { color: colors.foreground }]}>{fromMessage ? 'Telegram message' : 'Admin recognition'}</Text>
              <Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>{formatContributionDate(contribution.createdAt)}</Text>
            </View>
            <Text style={[styles.historyXp, { color: colors.primary }]}>+{contribution.xpAwarded} XP</Text>
          </View>
        );
      }) : (
        <Text style={[styles.inlineEmpty, { color: colors.mutedForeground }]}>Awards from this community will appear here.</Text>
      )}
    </View>
  );
}

export function CommunityXpPanel() {
  const colors = useColors();
  const { user, login } = useAuth();
  const authenticated = Boolean(user);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const communitiesQuery = useGetMyCommunities({
    query: {
      enabled: authenticated,
      queryKey: getGetMyCommunitiesQueryKey(),
      refetchInterval: 15_000,
      retry: 1,
    },
  });
  const communities = communitiesQuery.data?.communities ?? [];
  const firstChatId = communities[0]?.chatId ?? null;
  const selectedIsValid = communities.some((community) => community.chatId === selectedChatId);
  const activeChatId = selectedIsValid ? selectedChatId : firstChatId;

  const detailsQuery = useGetCommunityDetails(activeChatId ?? '', {
    query: {
      enabled: authenticated && Boolean(activeChatId),
      queryKey: getGetCommunityDetailsQueryKey(activeChatId ?? ''),
      refetchInterval: 15_000,
      retry: 1,
    },
  });

  if (!authenticated) return <LoginState onLogin={() => { void login(); }} />;

  if (communitiesQuery.isLoading) return <CommunityListSkeleton />;

  if (communitiesQuery.isError) return <ErrorState onRetry={() => { void communitiesQuery.refetch(); }} />;

  if (!communities.length) return <EmptyState />;

  const details = detailsQuery.data;
  return (
    <View style={styles.wrapper}>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.panelHeading}>
          <View style={styles.panelHeadingCopy}>
            <SectionLabel>GROUP REPUTATION</SectionLabel>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>Choose a community</Text>
            <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>Your standing is earned one Telegram group at a time.</Text>
          </View>
          <View style={[styles.panelIcon, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="users" size={18} color={colors.primary} />
          </View>
        </View>
        <CommunityPicker communities={communities} selectedChatId={activeChatId} onSelect={(chatId) => setSelectedChatId(chatId)} />
      </View>

      {detailsQuery.isLoading ? (
        <View style={[styles.detailSkeleton, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Skeleton style={{ width: '100%', height: 196, borderRadius: 18 }} />
          <View style={styles.statRow}><Skeleton style={{ flex: 1, height: 84, borderRadius: 13 }} /><Skeleton style={{ flex: 1, height: 84, borderRadius: 13 }} /></View>
          <Skeleton style={{ width: '100%', height: 188, borderRadius: 18 }} />
        </View>
      ) : detailsQuery.isError ? (
        <ErrorState onRetry={() => { void detailsQuery.refetch(); }} />
      ) : details ? (
        <View style={styles.detailStack}>
          <CommunityHero community={details.community} />
          <CommunityStats community={details.community} />
          <Leaderboard members={details.leaderboard} />
          <ContributionHistory contributions={details.recentContributions} />
        </View>
      ) : (
        <EmptyState />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12, marginBottom: 28 },
  panel: { borderWidth: 1, paddingVertical: 16, overflow: 'hidden' },
  panelHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  panelHeadingCopy: { flex: 1, minWidth: 0 },
  panelIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 20, lineHeight: 25, fontFamily: 'Inter_700Bold', marginTop: 5 },
  panelSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 4 },
  sectionLabel: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  communityChipRow: { gap: 8, paddingHorizontal: 16 },
  communityChip: { minWidth: 132, maxWidth: 210, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderRadius: 14 },
  communityChipMark: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  communityChipCopy: { flex: 1, minWidth: 0 },
  communityChipTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  communityChipMeta: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 1 },
  hero: { padding: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroTitleCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { fontSize: 9, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  heroTitle: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_700Bold', marginTop: 5 },
  heroLevelBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, maxWidth: 120 },
  heroLevelText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 20 },
  heroScore: { fontSize: 42, lineHeight: 45, fontFamily: 'Inter_700Bold' },
  heroScoreUnit: { fontSize: 14, fontFamily: 'Inter_700Bold', marginLeft: 5, marginBottom: 7 },
  heroRank: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', marginBottom: 7 },
  heroRankText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 7 },
  progressLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  nextLevel: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 7 },
  detailStack: { gap: 12 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, minHeight: 86, padding: 12 },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  statValue: { fontSize: 21, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 2 },
  contentCard: { borderWidth: 1, paddingHorizontal: 14, paddingTop: 15, paddingBottom: 4 },
  contentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  contentCardTitle: { fontSize: 17, lineHeight: 23, fontFamily: 'Inter_700Bold', marginTop: 4 },
  leaderboardRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 5 },
  leaderboardRank: { width: 27, fontSize: 11, fontFamily: 'Inter_700Bold' },
  leaderboardAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  leaderboardInitial: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  leaderboardCopy: { flex: 1, minWidth: 0 },
  leaderboardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leaderboardName: { flexShrink: 1, fontSize: 13, fontFamily: 'Inter_700Bold' },
  leaderboardMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  leaderboardXp: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  youBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  youBadgeText: { fontSize: 8, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  yourPlaceLabel: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold', paddingTop: 12, paddingBottom: 1, paddingHorizontal: 5 },
  historyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 5 },
  historyIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1, minWidth: 0 },
  historyTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  historyMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  historyXp: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  inlineEmpty: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', paddingVertical: 18, paddingHorizontal: 5 },
  skeleton: { borderRadius: 8, opacity: 0.72 },
  detailSkeleton: { gap: 12, padding: 12, borderWidth: 1 },
  stateCard: { alignItems: 'center', borderWidth: 1, padding: 22, marginBottom: 28 },
  stateIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stateTitle: { fontSize: 17, lineHeight: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 6 },
  stateButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, marginTop: 16 },
  stateButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  outlineButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 18, marginTop: 16 },
  outlineButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});