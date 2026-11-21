import { Feather } from '@expo/vector-icons';
import { useGetMyTelegramCommunities } from '@workspace/api-client-react';
import { openTelegramLink } from '@/lib/telegram';
import { useColors } from '@/hooks/useColors';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  onBack: () => void;
};

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonBlock({ width, height = 14 }: { width: number | `${number}%`; height?: number }) {
  const colors = useColors();
  return <View style={[styles.skeleton, { width, height, backgroundColor: colors.muted }]} />;
}

function LoadingState() {
  const colors = useColors();
  return (
    <View accessibilityLabel="Loading your Telegram communities" accessibilityLiveRegion="polite" style={styles.stateStack}>
      {[0, 1].map((item) => (
        <View
          key={item}
          style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <View style={styles.skeletonHeading}>
            <SkeletonBlock width={40} height={40} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock width="72%" height={16} />
              <SkeletonBlock width="38%" height={11} />
            </View>
          </View>
          <View style={styles.skeletonStats}>
            <SkeletonBlock width="48%" height={72} />
            <SkeletonBlock width="48%" height={72} />
          </View>
          <SkeletonBlock width="100%" height={44} />
        </View>
      ))}
    </View>
  );
}

function InfoNote() {
  const colors = useColors();
  return (
    <View style={[styles.infoNote, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '32' }]}>
      <Feather name="info" size={17} color={colors.accent} />
      <Text style={[styles.infoCopy, { color: colors.foreground }]}>
        Counts start when Experiences.fun begins tracking a group. Older Telegram history isn’t available to us.
      </Text>
    </View>
  );
}

function CommunityCard({
  community,
}: {
  community: {
    chatId: string;
    title: string;
    messageCount: number;
    qualifyingMessageCount: number;
    rank: number | null;
    joinedAt: string | null;
    trackingStartedAt: string;
    openUrl: string | null;
  };
}) {
  const colors = useColors();
  const joinedLabel = dateLabel(community.joinedAt);
  const trackingLabel = dateLabel(community.trackingStartedAt);

  return (
    <View
      testID={`my-telegram-community-${community.chatId}`}
      style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
    >
      <View style={styles.communityHeading}>
        <View style={[styles.groupMark, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={[styles.communityTitle, { color: colors.foreground }]}>
            {community.title}
          </Text>
          <Text style={[styles.rankText, { color: colors.mutedForeground }]}>
            {community.rank === null ? 'Not ranked yet' : `Community XP rank · #${community.rank}`}
          </Text>
        </View>
        <View style={[styles.rankMark, { backgroundColor: colors.muted }]}>
          <Feather name="activity" size={15} color={colors.secondary} />
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metric, { backgroundColor: colors.muted }]}>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {community.messageCount.toLocaleString()}
          </Text>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Observed human messages</Text>
        </View>
        <View style={[styles.metric, styles.qualifyingMetric, { backgroundColor: colors.primary + '0C', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.metricValue, { color: colors.primary }]}>
            {community.qualifyingMessageCount.toLocaleString()}
          </Text>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>XP-qualifying messages</Text>
        </View>
      </View>

      <View style={[styles.detailList, { borderTopColor: colors.border }]}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Telegram join date</Text>
          <Text style={[styles.detailValue, { color: colors.foreground }]}>
            {joinedLabel ?? 'Join date not recorded'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Tracking began</Text>
          <Text style={[styles.detailValue, { color: colors.foreground }]}>
            {trackingLabel ?? 'Date unavailable'}
          </Text>
        </View>
      </View>

      {community.openUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open community ${community.title} in Telegram`}
          accessibilityHint="Opens this public Telegram group"
          testID={`my-telegram-community-open-${community.chatId}`}
          onPress={() => openTelegramLink(community.openUrl!)}
          style={({ pressed }) => [
            styles.openButton,
            { backgroundColor: colors.primary, borderRadius: colors.radius - 5, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <Feather name="send" size={15} color={colors.primaryForeground} />
          <Text style={[styles.openButtonText, { color: colors.primaryForeground }]}>Open community</Text>
          <Feather name="arrow-up-right" size={15} color={colors.primaryForeground} />
        </Pressable>
      ) : (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open community"
            accessibilityState={{ disabled: true }}
            testID={`my-telegram-community-open-${community.chatId}`}
            disabled
            style={[
              styles.openButton,
              styles.disabledOpenButton,
              { backgroundColor: colors.muted, borderRadius: colors.radius - 5 },
            ]}
          >
            <Feather name="send" size={15} color={colors.mutedForeground} />
            <Text style={[styles.openButtonText, { color: colors.mutedForeground }]}>Open community</Text>
          </Pressable>
          <Text style={[styles.noPublicLink, { color: colors.mutedForeground }]}>
            No public Telegram link is available for this group.
          </Text>
        </View>
      )}
    </View>
  );
}

export function MyTelegramCommunitiesScreen({ onBack }: Props) {
  const colors = useColors();
  const communitiesQuery = useGetMyTelegramCommunities();
  const communities = communitiesQuery.data?.communities ?? [];

  return (
    <ScrollView
      testID="my-telegram-communities-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="my-telegram-communities-back"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.62 : 1 }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PARTICIPATION</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Telegram communities</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Your activity in groups linked to Experiences.fun.
          </Text>
        </View>
      </View>

      <InfoNote />

      {communitiesQuery.isLoading ? (
        <LoadingState />
      ) : communitiesQuery.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.destructive + '12' }]}>
            <Feather name="alert-circle" size={21} color={colors.destructive} />
          </View>
          <Text accessibilityRole="header" style={[styles.stateTitle, { color: colors.foreground }]}>
            Communities couldn’t load
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
            We couldn’t load your community activity. Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading Telegram communities"
            testID="my-telegram-communities-retry"
            onPress={() => { void communitiesQuery.refetch(); }}
            style={({ pressed }) => [
              styles.retryButton,
              { borderColor: colors.border, borderRadius: colors.radius - 5, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : communities.length === 0 ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.stateIcon, { backgroundColor: colors.secondary + '12' }]}>
            <Feather name="message-circle" size={21} color={colors.secondary} />
          </View>
          <Text accessibilityRole="header" style={[styles.stateTitle, { color: colors.foreground }]}>
            Your record starts here
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
            When you take part in a Telegram group tracked by Experiences.fun, your observed and qualifying messages will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.communityList}>
          <View style={styles.listHeading}>
            <Text style={[styles.listTitle, { color: colors.foreground }]}>Groups you’ve joined</Text>
            <Text style={[styles.groupCount, { color: colors.primary }]}>{communities.length}</Text>
          </View>
          {communities.map((community) => (
            <CommunityCard key={community.chatId} community={community} />
          ))}
        </View>
      )}
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  headingCopy: { flex: 1, minWidth: 0, paddingTop: 2 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 25, lineHeight: 31, fontFamily: 'Inter_700Bold', marginTop: 5 },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 4 },
  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13 },
  infoCopy: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  communityList: { gap: 12 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  listTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold' },
  groupCount: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  communityCard: { borderWidth: 1, padding: 15, gap: 14 },
  communityHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  titleCopy: { flex: 1, minWidth: 0 },
  communityTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'Inter_700Bold' },
  rankText: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_500Medium', marginTop: 3 },
  rankMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricsRow: { flexDirection: 'row', gap: 9 },
  metric: { flex: 1, minHeight: 82, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 13 },
  qualifyingMetric: { borderWidth: 1 },
  metricValue: { fontSize: 24, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 4 },
  detailList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 3, gap: 11 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  detailLabel: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 11, lineHeight: 16, fontFamily: 'Inter_600SemiBold' },
  openButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14 },
  disabledOpenButton: { opacity: 0.86 },
  openButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  noPublicLink: { fontSize: 11, lineHeight: 15, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 7 },
  stateStack: { gap: 12 },
  skeleton: { borderRadius: 8 },
  skeletonHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 9 },
  stateCard: { alignItems: 'flex-start', borderWidth: 1, padding: 18, gap: 10 },
  stateIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  stateTitle: { fontSize: 18, lineHeight: 23, fontFamily: 'Inter_700Bold' },
  stateBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  retryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 15, marginTop: 5 },
  retryText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
