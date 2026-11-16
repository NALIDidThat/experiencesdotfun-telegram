import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTelegramCommunityInsightsQueryKey,
  getGetTelegramCommunityManagementAuditQueryKey,
  getGetTelegramCommunityMembersQueryKey,
  getGetTelegramCommunityMemberHistoryQueryKey,
  getGetTelegramCommunityManagementQueryKey,
  getGetTelegramCommunityModerationEventsQueryKey,
  getGetTelegramCommunityRulesQueryKey,
  useAddTelegramCommunityLink,
  useAddTelegramCommunityPhrase,
  useDeleteTelegramCommunityLink,
  useDeleteTelegramCommunityPhrase,
  useGetTelegramCommunityLiveInfo,
  useGetTelegramCommunityMembers,
  useGetTelegramCommunityMemberHistory,
  useGetTelegramCommunityManagement,
  useGetTelegramCommunityInsights,
  useGetTelegramCommunityManagementAudit,
  useGetTelegramCommunityModerationEvents,
  useGetTelegramCommunityRules,
  usePreviewTelegramCommunityRules,
  useUpdateTelegramCommunityRiddleSettings,
  type TelegramManagedCommunity,
} from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { CommunityFeedSection } from '@/components/CommunityFeedSection';

type RuleFeedback = { message: string; tone: 'success' | 'error' };
type RulePreviewResult = {
  protectionEnabled: boolean;
  wouldDelete: boolean;
  matchedPhraseRuleIds: number[];
  unapprovedLinks: string[];
};

const RIDDLE_INTERVALS = [
  { minutes: 30, label: '30 min', fullLabel: '30 minutes' },
  { minutes: 60, label: '1 hour', fullLabel: '1 hour' },
  { minutes: 180, label: '3 hours', fullLabel: '3 hours' },
  { minutes: 360, label: '6 hours', fullLabel: '6 hours' },
  { minutes: 720, label: '12 hours', fullLabel: '12 hours' },
  { minutes: 1440, label: '24 hours', fullLabel: '24 hours' },
] as const;

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function formatMemberJoinDate(joinedAt: string | Date | null) {
  if (!joinedAt) return 'Not recorded';
  const date = joinedAt instanceof Date ? joinedAt : new Date(joinedAt);
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

type Props = {
  onBack: () => void;
  onOpenCommunity: (chatId: string) => void;
  onOpenBot: (startPayload?: string) => void;
};

function CommunityCard({
  community,
  onOpen,
}: {
  community: TelegramManagedCommunity;
  onOpen: () => void;
}) {
  const colors = useColors();
  const progress = community.dailyXpLimit
    ? Math.min(100, Math.round((community.xpAwardedToday / community.dailyXpLimit) * 100))
    : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${community.chatTitle}, ${community.organisationName}. ${community.xpAwardedToday.toLocaleString()} of ${community.dailyXpLimit.toLocaleString()} Community XP used today. ${community.spamProtectionEnabled ? 'Phrase protection on.' : 'Phrase protection off.'} ${community.riddlesEnabled ? `Automatic riddles every ${RIDDLE_INTERVALS.find(({ minutes }) => minutes === community.riddleIntervalMinutes)?.fullLabel ?? `${community.riddleIntervalMinutes} minutes`}.` : 'Automatic riddles off.'} Open group dashboard`}
      accessibilityHint="Opens this linked group's Community XP, protection, and scheduled-riddle dashboard"
      testID={`telegram-community-${community.chatId}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.communityCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <View
        style={styles.communityHeader}
      >
        <View style={[styles.groupIcon, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={18} color={colors.primary} />
        </View>
        <View style={styles.communityTitleCopy}>
          <Text numberOfLines={2} style={[styles.communityTitle, { color: colors.foreground }]}>
            {community.chatTitle}
          </Text>
          <Text numberOfLines={1} style={[styles.organisationName, { color: colors.mutedForeground }]}>
            {community.organisationName}
          </Text>
        </View>
        <ProtectionBadge community={community} compact />
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>

      <View style={styles.cardBudget}>
        <View style={styles.budgetHeader}>
          <Text style={[styles.budgetLabel, { color: colors.foreground }]}>Community XP today</Text>
          <Text style={[styles.budgetValue, { color: colors.foreground }]}>
            {community.xpAwardedToday.toLocaleString()} / {community.dailyXpLimit.toLocaleString()}
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Daily Community XP budget used for ${community.chatTitle}`}
          accessibilityValue={{ min: 0, max: community.dailyXpLimit, now: community.xpAwardedToday }}
          style={[styles.progressTrack, { backgroundColor: colors.border }]}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: progress >= 100 ? colors.accent : colors.primary },
            ]}
          />
        </View>
      </View>
      <View style={styles.riddleStatusRow}>
        <Feather name="help-circle" size={13} color={community.riddlesEnabled ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.riddleStatusText, { color: community.riddlesEnabled ? colors.primary : colors.mutedForeground }]}>
          {community.riddlesEnabled
            ? `Riddles every ${RIDDLE_INTERVALS.find(({ minutes }) => minutes === community.riddleIntervalMinutes)?.fullLabel ?? `${community.riddleIntervalMinutes} minutes`}`
            : 'Automatic riddles off'}
        </Text>
      </View>
      <View style={styles.openDashboard}>
        <Text style={[styles.openDashboardText, { color: colors.primary }]}>Open group dashboard</Text>
        <Feather name="arrow-up-right" size={15} color={colors.primary} />
      </View>
    </Pressable>
  );
}

function ProtectionBadge({
  community,
  compact = false,
}: {
  community: TelegramManagedCommunity;
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityLabel={`Phrase protection ${community.spamProtectionEnabled ? 'on' : 'off'}`}
      style={[
        styles.protectionBadge,
        compact && styles.compactProtectionBadge,
        {
          backgroundColor: community.spamProtectionEnabled ? colors.success + '16' : colors.muted,
        },
      ]}
    >
      <View
        style={[
          styles.protectionDot,
          { backgroundColor: community.spamProtectionEnabled ? colors.success : colors.mutedForeground },
        ]}
      />
      <Text
        style={[
          styles.protectionText,
          { color: community.spamProtectionEnabled ? colors.success : colors.mutedForeground },
        ]}
      >
        {compact
          ? community.spamProtectionEnabled ? 'Protection on' : 'Protection off'
          : community.spamProtectionEnabled ? 'On' : 'Off'}
      </Text>
    </View>
  );
}

function GroupStats({ community }: { community: TelegramManagedCommunity }) {
  const colors = useColors();
  const stats = [
    { label: 'XP remaining today', value: community.dailyXpRemaining.toLocaleString() },
    { label: 'Lifetime cap per member', value: `${community.memberXpLimit.toLocaleString()} XP` },
    { label: 'Lifetime XP awarded', value: community.totalXpAwarded.toLocaleString() },
    { label: 'Members with XP', value: community.membersWithXp.toLocaleString() },
    { label: 'Tracked profiles', value: community.trackedMembers.toLocaleString() },
    { label: 'Members with XP activity today', value: community.xpEarnersToday.toLocaleString() },
  ];
  return (
    <View testID={`telegram-community-stats-${community.chatId}`} style={styles.statsGrid}>
      {stats.map(({ label, value }) => (
        <View key={label} style={[styles.statCell, { backgroundColor: colors.muted }]}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function CommunityBudget({ community }: { community: TelegramManagedCommunity }) {
  const colors = useColors();
  const progress = community.dailyXpLimit
    ? Math.min(100, Math.round((community.xpAwardedToday / community.dailyXpLimit) * 100))
    : 0;
  return (
    <View>
      <View style={styles.budgetHeader}>
        <Text style={[styles.budgetLabel, { color: colors.foreground }]}>Community XP today</Text>
        <Text style={[styles.budgetValue, { color: colors.foreground }]}>
          {community.xpAwardedToday.toLocaleString()} / {community.dailyXpLimit.toLocaleString()}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Daily Community XP budget used"
        accessibilityValue={{ min: 0, max: community.dailyXpLimit, now: community.xpAwardedToday }}
        style={[styles.progressTrack, { backgroundColor: colors.border }]}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: progress >= 100 ? colors.accent : colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

export function TelegramCommunityManagementScreen({ onBack, onOpenCommunity, onOpenBot }: Props) {
  const colors = useColors();
  const management = useGetTelegramCommunityManagement();
  const communities = management.data?.communities ?? [];

  return (
    <ScrollView
      testID="telegram-community-management-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="telegram-community-back"
          onPress={onBack}
          hitSlop={8}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>ORGANISATION TOOLS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Telegram groups</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Check XP and protection status, and configure scheduled riddles for each group.
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.setupCard,
          { backgroundColor: colors.primary + '0B', borderColor: colors.primary + '32', borderRadius: colors.radius },
        ]}
      >
        <View style={[styles.setupIcon, { backgroundColor: colors.primary + '16' }]}>
          <Feather name="shield" size={18} color={colors.primary} />
        </View>
        <View style={styles.setupCopy}>
          <Text style={[styles.setupTitle, { color: colors.foreground }]}>Safe group setup</Text>
          <Text style={[styles.setupText, { color: colors.mutedForeground }]}>
            Connect from the Telegram group with the account that owns this organisation. The bot needs admin access; phrase protection also needs permission to delete messages.
          </Text>
        </View>
      </View>

      {management.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading your linked groups…</Text>
        </View>
      ) : management.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="alert-circle" size={22} color={colors.destructive} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Groups couldn’t be loaded</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Check your connection, or confirm this organisation profile has a linked Telegram identity.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="telegram-community-retry"
            onPress={() => { void management.refetch(); }}
            style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : communities.length === 0 ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary + '12' }]}>
            <Feather name="message-circle" size={21} color={colors.secondary} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>No linked Telegram groups</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Add the bot to your group as an admin, then run /community in that group using this organisation’s Telegram account.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="telegram-community-open-bot"
            onPress={() => onOpenBot('community')}
            style={({ pressed }) => [
              styles.manageButton,
              { backgroundColor: colors.primary, borderRadius: colors.radius - 5, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Feather name="send" size={16} color={colors.primaryForeground} />
            <Text style={[styles.manageButtonText, { color: colors.primaryForeground }]}>Open bot setup</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.communityList}>
          <View style={styles.listHeading}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your linked groups</Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>{communities.length}</Text>
          </View>
          {communities.map((community) => (
            <CommunityCard
              key={community.chatId}
              community={community}
              onOpen={() => onOpenCommunity(community.chatId)}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another Telegram community"
            accessibilityHint="Opens the bot setup in Telegram to link another group."
            testID="telegram-community-add"
            onPress={() => onOpenBot('community')}
            style={({ pressed }) => [
              styles.addCommunityButton,
              {
                backgroundColor: colors.primary + '08',
                borderColor: colors.primary + '55',
                borderRadius: colors.radius,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Feather name="plus-circle" size={18} color={colors.primary} />
            <Text style={[styles.addCommunityButtonText, { color: colors.primary }]}>Add community</Text>
          </Pressable>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

type HealthMetricKey = 'active-members' | 'messages' | 'moderation' | 'xp';

function ConnectionBadge({
  status,
}: {
  status: 'connected' | 'disconnected' | 'permission_issue' | 'error' | 'checking';
}) {
  const colors = useColors();
  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    permission_issue: 'Permission issue',
    error: 'Status unavailable',
    checking: 'Checking Telegram',
  } as const;
  const color = status === 'connected'
    ? colors.success
    : status === 'disconnected' || status === 'permission_issue'
      ? colors.destructive
      : colors.mutedForeground;
  return (
    <View
      accessibilityLabel={`Telegram ${labels[status]}`}
      style={[styles.connectionBadge, { backgroundColor: `${color}16` }]}
    >
      <View style={[styles.protectionDot, { backgroundColor: color }]} />
      <Text style={[styles.connectionText, { color }]}>{labels[status]}</Text>
    </View>
  );
}

export function TelegramCommunityDashboardScreen({
  chatId,
  onBack,
  onOpenBot,
}: {
  chatId?: string;
  onBack: () => void;
  onOpenBot: (startPayload?: string) => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [selectedMetric, setSelectedMetric] = useState<HealthMetricKey | null>(null);
  const [phraseDraft, setPhraseDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [phraseFeedback, setPhraseFeedback] = useState<RuleFeedback | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<RuleFeedback | null>(null);
  const [riddleFeedback, setRiddleFeedback] = useState<RuleFeedback | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberOffset, setMemberOffset] = useState(0);
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [insightDays, setInsightDays] = useState<7 | 30 | 90>(7);
  const [previewText, setPreviewText] = useState('');
  const [previewFeedback, setPreviewFeedback] = useState<RuleFeedback | null>(null);
  const [previewResult, setPreviewResult] = useState<RulePreviewResult | null>(null);
  const management = useGetTelegramCommunityManagement();
  const liveInfo = useGetTelegramCommunityLiveInfo(chatId ?? '', {
    query: {
      queryKey: ['/api/community/manage', chatId, 'live-info'],
      enabled: Boolean(chatId),
    },
  });
  const memberQuery = {
    chatId: chatId ?? '',
    search: memberSearch.trim() || undefined,
    limit: 20,
    offset: memberOffset,
  };
  const members = useGetTelegramCommunityMembers(memberQuery, {
    query: {
      queryKey: getGetTelegramCommunityMembersQueryKey(memberQuery),
      enabled: Boolean(chatId),
    },
  });
  const memberHistoryQuery = {
    chatId: chatId ?? '',
    memberId: expandedMemberId ?? 0,
    days: 30 as const,
  };
  const memberHistory = useGetTelegramCommunityMemberHistory(memberHistoryQuery, {
    query: {
      queryKey: getGetTelegramCommunityMemberHistoryQueryKey(memberHistoryQuery),
      enabled: Boolean(chatId && expandedMemberId !== null),
    },
  });
  const insights = useGetTelegramCommunityInsights({
    chatId: chatId ?? '',
    days: insightDays,
  }, {
    query: {
      queryKey: getGetTelegramCommunityInsightsQueryKey({ chatId: chatId ?? '', days: insightDays }),
      enabled: Boolean(chatId),
    },
  });
  const moderationEvents = useGetTelegramCommunityModerationEvents({
    chatId: chatId ?? '',
    limit: 20,
    offset: 0,
  }, {
    query: {
      queryKey: getGetTelegramCommunityModerationEventsQueryKey({ chatId: chatId ?? '', limit: 20, offset: 0 }),
      enabled: Boolean(chatId),
    },
  });
  const managementAudit = useGetTelegramCommunityManagementAudit({
    chatId: chatId ?? '',
    limit: 20,
  }, {
    query: {
      queryKey: getGetTelegramCommunityManagementAuditQueryKey({ chatId: chatId ?? '', limit: 20 }),
      enabled: Boolean(chatId),
    },
  });
  const rules = useGetTelegramCommunityRules(chatId ?? '', {
    query: {
      queryKey: getGetTelegramCommunityRulesQueryKey(chatId ?? ''),
      enabled: Boolean(chatId),
    },
  });
  const addPhrase = useAddTelegramCommunityPhrase();
  const removePhrase = useDeleteTelegramCommunityPhrase();
  const addLink = useAddTelegramCommunityLink();
  const removeLink = useDeleteTelegramCommunityLink();
  const updateRiddles = useUpdateTelegramCommunityRiddleSettings();
  const previewRules = usePreviewTelegramCommunityRules();
  const community = management.data?.communities.find((item) => item.chatId === chatId);
  const displayedTitle = liveInfo.data?.connectionStatus !== 'error' && liveInfo.data?.chatTitle
    ? liveInfo.data.chatTitle
    : community?.chatTitle ?? liveInfo.data?.chatTitle ?? 'Group dashboard';
  const connectionStatus = liveInfo.isLoading
    ? 'checking'
    : liveInfo.data?.connectionStatus ?? 'error';
  const healthMetrics: Array<{
    key: HealthMetricKey;
    label: string;
    value: string;
    icon: keyof typeof Feather.glyphMap;
  }> = community
    ? [
        {
          key: 'active-members',
          label: 'Members with XP activity today',
          value: community.xpEarnersToday.toLocaleString(),
          icon: 'users',
        },
        {
          key: 'messages',
          label: 'Qualifying messages today',
          value: community.qualifyingMessagesToday.toLocaleString(),
          icon: 'message-circle',
        },
        {
          key: 'moderation',
          label: 'Moderation actions',
          value: moderationEvents.data?.total.toLocaleString() ?? '—',
          icon: 'shield',
        },
        {
          key: 'xp',
          label: 'XP distributed today',
          value: community.xpAwardedToday.toLocaleString(),
          icon: 'award',
        },
      ]
    : [];
  const selectedMetricCopy: Record<HealthMetricKey, { title: string; body: string }> = {
    'active-members': {
      title: 'Members with XP activity today',
      body: 'This counts tracked group profiles with a Community XP contribution since 00:00 UTC. Members who chatted without earning or receiving XP are not included.',
    },
    messages: {
      title: 'Qualifying messages today',
      body: 'This counts text messages recorded by the Community XP system after meeting its message-length rule. It is not a count of every message sent in Telegram.',
    },
    moderation: {
      title: 'Automated moderation actions',
      body: 'This counts saved phrase and link matches, including whether Telegram confirmed deletion. Message text is not stored in the moderation history.',
    },
    xp: {
      title: 'XP distributed today',
      body: `${community?.xpAwardedToday.toLocaleString() ?? '0'} of ${community?.dailyXpLimit.toLocaleString() ?? '0'} XP used. ${community?.dailyXpRemaining.toLocaleString() ?? '0'} XP remains before the 00:00 UTC reset.`,
    },
  };

  async function refreshRules() {
    if (!chatId) return;
    await queryClient.invalidateQueries({
      queryKey: getGetTelegramCommunityRulesQueryKey(chatId),
    });
  }

  async function savePhrase() {
    const phrase = phraseDraft.trim().replace(/\s+/g, ' ');
    if (!chatId || [...phrase].length < 2 || [...phrase].length > 80) {
      setPhraseFeedback({ message: 'Enter a phrase between 2 and 80 characters.', tone: 'error' });
      return;
    }
    setPhraseFeedback(null);
    try {
      await addPhrase.mutateAsync({ chatId, data: { phrase } });
      setPhraseDraft('');
      setPhraseFeedback({ message: 'Banned phrase added.', tone: 'success' });
      await refreshRules();
    } catch (error) {
      setPhraseFeedback({ message: errorMessage(error, 'Could not add that phrase. Try again.'), tone: 'error' });
    }
  }

  async function deletePhrase(ruleId: number) {
    if (!chatId) return;
    setPhraseFeedback(null);
    try {
      await removePhrase.mutateAsync({ chatId, ruleId });
      setPhraseFeedback({ message: 'Banned phrase removed.', tone: 'success' });
      await refreshRules();
    } catch (error) {
      setPhraseFeedback({ message: errorMessage(error, 'Could not remove that phrase. Try again.'), tone: 'error' });
    }
  }

  async function saveLink() {
    const link = linkDraft.trim();
    if (!chatId || !link || link.length > 2048) {
      setLinkFeedback({ message: 'Enter a URL or domain to whitelist.', tone: 'error' });
      return;
    }
    setLinkFeedback(null);
    try {
      await addLink.mutateAsync({ chatId, data: { link } });
      setLinkDraft('');
      setLinkFeedback({ message: 'Whitelisted link added.', tone: 'success' });
      await refreshRules();
    } catch (error) {
      setLinkFeedback({ message: errorMessage(error, 'Could not add that link. Try again.'), tone: 'error' });
    }
  }

  async function testRulesAgainstSample() {
    const text = previewText.trim();
    if (!chatId || !text) {
      setPreviewFeedback({ message: 'Enter a sample message to test.', tone: 'error' });
      setPreviewResult(null);
      return;
    }
    setPreviewFeedback(null);
    setPreviewResult(null);
    try {
      const result = await previewRules.mutateAsync({ chatId, data: { text } });
      setPreviewResult(result);
      setPreviewFeedback({
        message: result.wouldDelete
          ? 'This sample would be removed by the current protection rules.'
          : result.protectionEnabled
            ? 'This sample would stay in the group.'
            : 'Protection is off, so matching rules would not remove this sample.',
        tone: 'success',
      });
    } catch (error) {
      setPreviewFeedback({
        message: errorMessage(error, 'Could not test the sample against these rules.'),
        tone: 'error',
      });
    }
  }

  async function saveRiddleSettings(
    enabled: boolean,
    intervalMinutes: TelegramManagedCommunity['riddleIntervalMinutes'],
  ) {
    if (!chatId || !community || updateRiddles.isPending) return;
    setRiddleFeedback(null);
    try {
      await updateRiddles.mutateAsync({
        chatId,
        data: { enabled, intervalMinutes },
      });
      const interval = RIDDLE_INTERVALS.find(({ minutes }) => minutes === intervalMinutes)?.fullLabel
        ?? `${intervalMinutes} minutes`;
      setRiddleFeedback({
        message: enabled
          ? `Scheduled riddles are on. The next one is due in ${interval}.`
          : `Scheduled riddles are off. The ${interval} interval is saved.`,
        tone: 'success',
      });
      await queryClient.invalidateQueries({
        queryKey: getGetTelegramCommunityManagementQueryKey(),
      });
    } catch (error) {
      setRiddleFeedback({
        message: errorMessage(error, 'Could not update scheduled riddles. Try again.'),
        tone: 'error',
      });
    }
  }

  async function deleteLink(ruleId: number) {
    if (!chatId) return;
    setLinkFeedback(null);
    try {
      await removeLink.mutateAsync({ chatId, ruleId });
      setLinkFeedback({ message: 'Whitelisted link removed.', tone: 'success' });
      await refreshRules();
    } catch (error) {
      setLinkFeedback({ message: errorMessage(error, 'Could not remove that link. Try again.'), tone: 'error' });
    }
  }

  return (
    <KeyboardAwareScrollViewCompat
      testID="telegram-community-dashboard-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      bottomOffset={48}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to linked groups"
          testID="telegram-community-dashboard-back"
          onPress={onBack}
          hitSlop={8}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>GROUP OVERVIEW</Text>
          <Text numberOfLines={2} style={[styles.title, { color: colors.foreground }]}>
            {displayedTitle}
          </Text>
          {community ? (
            <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {community.organisationName}
            </Text>
          ) : null}
          {community ? (
            <View style={styles.connectionRow}>
              <ConnectionBadge status={connectionStatus} />
              <Text style={[styles.memberCountText, { color: colors.mutedForeground }]}>
                {liveInfo.isLoading
                  ? 'Checking member count…'
                  : liveInfo.data?.memberCount !== null && liveInfo.data?.memberCount !== undefined
                    ? `${liveInfo.data.memberCount.toLocaleString()} Telegram members`
                    : 'Telegram member count unavailable'}
              </Text>
            </View>
          ) : null}
        </View>
        {community ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${displayedTitle} group settings in Telegram`}
            testID="telegram-community-dashboard-settings"
            onPress={() => onOpenBot(`community_${community.chatId}`)}
            hitSlop={8}
            style={({ pressed }) => [styles.settingsShortcut, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Feather name="settings" size={19} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {management.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading group dashboard…</Text>
        </View>
      ) : management.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="alert-circle" size={22} color={colors.destructive} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Dashboard couldn’t be loaded</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="telegram-community-dashboard-retry"
            onPress={() => { void management.refetch(); }}
            style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : !community ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="users" size={22} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Group not found</Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            This group may have been disconnected from the organisation.
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="telegram-community-dashboard-back-to-list"
            onPress={onBack}
            style={[styles.secondaryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
          >
            <Feather name="arrow-left" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Back to linked groups</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.dashboardSections}>
          {chatId ? <CommunityFeedSection chatId={chatId} /> : null}
          {liveInfo.data?.description ? (
            <Text style={[styles.communityDescription, { color: colors.mutedForeground }]}>
              {liveInfo.data.description}
            </Text>
          ) : null}
          {liveInfo.data?.connectionMessage ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.connectionNotice,
                { backgroundColor: colors.primary + '0B', borderColor: colors.primary + '32', borderRadius: colors.radius },
              ]}
            >
              <Feather
                name={liveInfo.data.connectionStatus === 'error' ? 'alert-circle' : 'info'}
                size={16}
                color={liveInfo.data.connectionStatus === 'error' ? colors.destructive : colors.primary}
              />
              <Text style={[styles.connectionNoticeText, { color: colors.foreground }]}>
                {liveInfo.data.connectionMessage}
              </Text>
              {liveInfo.data.connectionStatus === 'error' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry Telegram connection check"
                  onPress={() => { void liveInfo.refetch(); }}
                  hitSlop={8}
                >
                  <Feather name="refresh-cw" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {liveInfo.data.connectionStatus !== 'connected' && community ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Telegram group setup to fix permissions"
                  testID="telegram-community-fix-connection"
                  onPress={() => onOpenBot(`community_${community.chatId}`)}
                  hitSlop={8}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Fix access</Text>
                </Pressable>
              ) : null}
            </View>
          ) : liveInfo.isError ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.connectionNotice,
                { backgroundColor: colors.muted, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <Feather name="alert-circle" size={16} color={colors.mutedForeground} />
              <Text style={[styles.connectionNoticeText, { color: colors.foreground }]}>
                Telegram status could not be checked. Your saved XP and protection settings are still shown below.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry Telegram connection check"
                onPress={() => { void liveInfo.refetch(); }}
                hitSlop={8}
              >
                <Feather name="refresh-cw" size={16} color={colors.primary} />
              </Pressable>
            </View>
          ) : null}

          <View
            testID="telegram-community-riddle-settings"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '14' }]}>
                <Feather name="help-circle" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Scheduled riddles</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  {community.riddlesEnabled
                    ? `On · every ${RIDDLE_INTERVALS.find(({ minutes }) => minutes === community.riddleIntervalMinutes)?.fullLabel ?? `${community.riddleIntervalMinutes} minutes`}`
                    : 'Off · turn them on to post riddles automatically'}
                </Text>
              </View>
              <View
                accessibilityLabel={`Automatic riddles ${community.riddlesEnabled ? 'on' : 'off'}`}
                style={[
                  styles.riddleStateBadge,
                  { backgroundColor: community.riddlesEnabled ? colors.success + '16' : colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.protectionDot,
                    { backgroundColor: community.riddlesEnabled ? colors.success : colors.mutedForeground },
                  ]}
                />
                <Text style={[styles.connectionText, { color: community.riddlesEnabled ? colors.success : colors.mutedForeground }]}>
                  {community.riddlesEnabled ? 'On' : 'Off'}
                </Text>
              </View>
            </View>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground, marginBottom: 12 }]}>
              A new riddle is posted after each interval. Each round stays open for 15 minutes. Settings apply to this linked group only.
            </Text>
            <View style={styles.riddleIntervalGrid}>
              {RIDDLE_INTERVALS.map(({ minutes, label, fullLabel }) => {
                const selected = community.riddleIntervalMinutes === minutes;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="button"
                    accessibilityLabel={`Set riddle interval to every ${fullLabel}`}
                    accessibilityState={{ selected, disabled: updateRiddles.isPending }}
                    testID={`telegram-community-riddle-interval-${minutes}`}
                    disabled={updateRiddles.isPending}
                    onPress={() => { void saveRiddleSettings(community.riddlesEnabled, minutes); }}
                    style={({ pressed }) => [
                      styles.riddleIntervalButton,
                      {
                        backgroundColor: selected ? colors.primary + '12' : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius - 5,
                        opacity: pressed || updateRiddles.isPending ? 0.68 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.riddleIntervalText, { color: selected ? colors.primary : colors.foreground }]}>
                      {label}
                    </Text>
                    {selected ? <Feather name="check" size={14} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Turn scheduled riddles ${community.riddlesEnabled ? 'off' : 'on'}`}
              testID="telegram-community-riddle-toggle"
              disabled={updateRiddles.isPending}
              onPress={() => { void saveRiddleSettings(!community.riddlesEnabled, community.riddleIntervalMinutes); }}
              style={({ pressed }) => [
                styles.riddleToggleButton,
                {
                  backgroundColor: community.riddlesEnabled ? colors.muted : colors.primary,
                  borderRadius: colors.radius - 5,
                  opacity: pressed || updateRiddles.isPending ? 0.72 : 1,
                },
              ]}
            >
              {updateRiddles.isPending
                ? <ActivityIndicator size="small" color={community.riddlesEnabled ? colors.foreground : colors.primaryForeground} />
                : <Feather name={community.riddlesEnabled ? 'pause-circle' : 'play-circle'} size={17} color={community.riddlesEnabled ? colors.foreground : colors.primaryForeground} />}
              <Text style={[styles.riddleToggleText, { color: community.riddlesEnabled ? colors.foreground : colors.primaryForeground }]}>
                {updateRiddles.isPending
                  ? 'Saving…'
                  : community.riddlesEnabled ? 'Turn automatic riddles off' : 'Turn automatic riddles on'}
              </Text>
            </Pressable>
            {riddleFeedback ? (
              <Text
                accessibilityRole={riddleFeedback.tone === 'error' ? 'alert' : 'text'}
                testID="telegram-community-riddle-feedback"
                style={[
                  styles.ruleFeedback,
                  { color: riddleFeedback.tone === 'error' ? colors.destructive : colors.success },
                ]}
              >
                {riddleFeedback.message}
              </Text>
            ) : null}
          </View>

          <View>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Community health</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Tracked activity and automated protection
                </Text>
              </View>
            </View>
            <View style={styles.healthGrid}>
              {healthMetrics.map((metric) => {
                const selected = selectedMetric === metric.key;
                return (
                  <Pressable
                    key={metric.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${metric.label}: ${metric.value}. ${selected ? 'Hide' : 'View'} metric details`}
                    accessibilityState={{ expanded: selected }}
                    testID={`telegram-community-health-${metric.key}`}
                    onPress={() => setSelectedMetric(selected ? null : metric.key)}
                    style={({ pressed }) => [
                      styles.healthMetric,
                      {
                        backgroundColor: colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <View style={[styles.healthIcon, { backgroundColor: colors.primary + '12' }]}>
                      <Feather name={metric.icon} size={15} color={colors.primary} />
                    </View>
                    <Text style={[styles.healthLabel, { color: colors.mutedForeground }]}>{metric.label}</Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.healthValue,
                        { color: metric.key === 'moderation' ? colors.mutedForeground : colors.foreground },
                      ]}
                    >
                      {metric.value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedMetric ? (
              <View
                testID="telegram-community-health-detail"
                style={[
                  styles.healthDetail,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.healthDetailTitle, { color: colors.foreground }]}>
                  {selectedMetricCopy[selectedMetric].title}
                </Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  {selectedMetricCopy[selectedMetric].body}
                </Text>
              </View>
            ) : null}
          </View>

          <View
            testID="telegram-community-insights"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '14' }]}>
                <Feather name="activity" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Message activity</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  XP-eligible messages received from linked-group updates
                </Text>
              </View>
            </View>
            <View style={[styles.riddleIntervalGrid, { marginTop: 12 }]}>
              {([7, 30, 90] as const).map((days) => {
                const selected = insightDays === days;
                return (
                  <Pressable
                    key={days}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${days} days of Telegram message activity`}
                    accessibilityState={{ selected }}
                    testID={`telegram-community-insights-${days}`}
                    onPress={() => setInsightDays(days)}
                    style={({ pressed }) => [
                      styles.riddleIntervalButton,
                      {
                        backgroundColor: selected ? colors.primary + '12' : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius - 5,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.riddleIntervalText, { color: selected ? colors.primary : colors.foreground }]}>
                      {days} days
                    </Text>
                    {selected ? <Feather name="check" size={14} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
            {insights.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Loading message activity…</Text>
              </View>
            ) : insights.isError ? (
              <View style={styles.rulesError}>
                <Text style={[styles.sectionDescription, { color: colors.destructive }]}>
                  {errorMessage(insights.error, 'Message activity could not be loaded.')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading message activity"
                  testID="telegram-community-insights-retry"
                  onPress={() => { void insights.refetch(); }}
                  style={[styles.ruleRetryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
                >
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : insights.data?.days.length ? (
              <View style={{ gap: 9, marginTop: 12 }}>
                <Text style={[styles.sectionDescription, { color: colors.foreground }]}>
                  {insights.data.days.reduce((total, day) => total + day.qualifyingMessageCount, 0).toLocaleString()} qualifying messages recorded
                </Text>
                {insights.data.days.slice(-14).map((day) => (
                  <View
                    key={day.date}
                    style={[styles.memberRow, { borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }]}
                  >
                    <Text style={[styles.memberJoinedText, { color: colors.foreground }]}>
                      {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </Text>
                    <Text style={[styles.memberJoinedText, { color: colors.mutedForeground }]}>
                      {day.qualifyingMessageCount.toLocaleString()} messages · {day.activeMembers.toLocaleString()} members
                    </Text>
                  </View>
                ))}
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Daily message totals use Telegram update dates. Only qualifying human text or captions count; this is not a measure of real-world contribution.
                </Text>
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                No qualifying messages were recorded for this period.
              </Text>
            )}
          </View>

          <View
            testID="telegram-community-top-members"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '14' }]}>
                <Feather name="users" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tracked members</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Search members and see their qualifying message totals
                </Text>
              </View>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {members.data?.total.toLocaleString() ?? '—'}
              </Text>
            </View>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground, marginBottom: 10 }]}>
              Counts use the existing XP message rule: human group text or captions with at least seven words, excluding commands. The bot can count messages only after the group is linked; existing qualifying contribution records are included. Telegram does not provide the bot with older chat history.
            </Text>
            {members.data?.trackingStartedAt ? (
              <Text style={[styles.sectionDescription, { color: colors.mutedForeground, marginBottom: 10 }]}>
                Tracking started · {formatMemberJoinDate(members.data.trackingStartedAt)}
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="Search tracked Telegram members"
              testID="telegram-community-member-search"
              value={memberSearch}
              onChangeText={(value) => {
                setMemberSearch(value);
                setMemberOffset(0);
                setExpandedMemberId(null);
              }}
              placeholder="Search name or username"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[
                styles.ruleInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderRadius: colors.radius - 5,
                  color: colors.foreground,
                  marginBottom: 10,
                  width: '100%',
                },
              ]}
            />
            {members.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Loading member activity…
                </Text>
              </View>
            ) : members.isError ? (
              <View style={styles.rulesError}>
                <Text style={[styles.sectionDescription, { color: colors.destructive }]}>
                  {errorMessage(members.error, 'Member activity could not be loaded.')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading tracked members"
                  testID="telegram-community-members-retry"
                  onPress={() => { void members.refetch(); }}
                  style={[
                    styles.ruleRetryButton,
                    { borderColor: colors.border, borderRadius: colors.radius - 5 },
                  ]}
                >
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : members.data?.members.length ? (
              <View style={styles.memberList}>
                {members.data.members.map((member, index) => (
                  <View
                    key={member.id}
                    testID={`telegram-community-member-${member.id}`}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${member.name}, ${member.qualifyingMessageCount} qualifying messages. ${expandedMemberId === member.id ? 'Hide' : 'Show'} recent history`}
                      accessibilityState={{ expanded: expandedMemberId === member.id }}
                      testID={`telegram-community-member-expand-${member.id}`}
                      onPress={() => setExpandedMemberId((current) => current === member.id ? null : member.id)}
                      style={[
                        styles.memberRow,
                        { borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={styles.memberMainRow}>
                        <Text style={[styles.memberRank, { color: colors.mutedForeground }]}>
                          {index + 1}
                        </Text>
                        <View style={styles.memberIdentity}>
                          <Text numberOfLines={1} style={[styles.memberName, { color: colors.foreground }]}>
                            {member.name}
                          </Text>
                          {member.username ? (
                            <Text numberOfLines={1} style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                              @{member.username}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.memberMessageCount}>
                          <Text style={[styles.memberMessageValue, { color: colors.foreground }]}>
                            {member.qualifyingMessageCount.toLocaleString()}
                          </Text>
                          <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                            eligible
                          </Text>
                        </View>
                        <Feather
                          name={expandedMemberId === member.id ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </View>
                      <View style={styles.memberJoinedRow}>
                        <Feather name="calendar" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.memberJoinedText, { color: colors.mutedForeground }]}>
                          {member.leftAt
                            ? `Left · ${formatMemberJoinDate(member.leftAt)}`
                            : `Joined · ${formatMemberJoinDate(member.joinedAt)}`}
                        </Text>
                      </View>
                    </Pressable>
                    {expandedMemberId === member.id ? (
                      <View style={{ borderBottomColor: colors.border, borderBottomWidth: 1, gap: 7, paddingBottom: 12, paddingHorizontal: 12 }}>
                        <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                          Recent qualifying-message history · last 30 days
                        </Text>
                        {memberHistory.isLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : memberHistory.isError ? (
                          <Text style={[styles.sectionDescription, { color: colors.destructive }]}>
                            {errorMessage(memberHistory.error, 'Member history could not be loaded.')}
                          </Text>
                        ) : memberHistory.data?.days.some((day) => day.qualifyingMessageCount > 0) ? (
                          memberHistory.data.days
                            .filter((day) => day.qualifyingMessageCount > 0)
                            .slice(-14)
                            .reverse()
                            .map((day) => (
                              <View key={day.date} style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={[styles.memberJoinedText, { color: colors.foreground }]}>
                                  {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                                </Text>
                                <Text style={[styles.memberJoinedText, { color: colors.mutedForeground }]}>
                                  {day.qualifyingMessageCount.toLocaleString()} messages
                                </Text>
                              </View>
                            ))
                        ) : (
                          <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                            No qualifying messages recorded in this period.
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                {memberSearch.trim()
                  ? 'No tracked members match that search.'
                  : 'No members have been observed yet. Counts begin when the bot receives group updates.'}
              </Text>
            )}
            {members.data?.total ? (
              <View style={[styles.ruleInputRow, { justifyContent: 'space-between', marginTop: 12 }]}>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  {memberOffset + 1}–{Math.min(memberOffset + members.data.members.length, members.data.total)} of {members.data.total}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous member page"
                    testID="telegram-community-members-previous"
                    disabled={memberOffset === 0}
                    onPress={() => {
                      setExpandedMemberId(null);
                      setMemberOffset((offset) => Math.max(0, offset - 20));
                    }}
                    style={[styles.ruleRetryButton, { borderColor: colors.border, borderRadius: colors.radius - 5, opacity: memberOffset === 0 ? 0.45 : 1 }]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Previous</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next member page"
                    testID="telegram-community-members-next"
                    disabled={memberOffset + (members.data?.members.length ?? 0) >= (members.data?.total ?? 0)}
                    onPress={() => {
                      setExpandedMemberId(null);
                      setMemberOffset((offset) => offset + 20);
                    }}
                    style={[styles.ruleRetryButton, { borderColor: colors.border, borderRadius: colors.radius - 5, opacity: memberOffset + (members.data?.members.length ?? 0) >= (members.data?.total ?? 0) ? 0.45 : 1 }]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Next</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>

          <View
            testID="telegram-community-moderation-history"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.accent + '16' }]}>
                <Feather name="shield" size={18} color={colors.accent} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Moderation history</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Rule matches and whether Telegram removed the message
                </Text>
              </View>
            </View>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground, marginTop: 5 }]}>
              Message text and links are not saved in this history.
            </Text>
            {moderationEvents.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Loading moderation history…</Text>
              </View>
            ) : moderationEvents.isError ? (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                {errorMessage(moderationEvents.error, 'Moderation history is unavailable.')}
              </Text>
            ) : moderationEvents.data?.events.length ? (
              <View style={styles.memberList}>
                {moderationEvents.data.events.map((event) => (
                  <View key={event.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.memberMainRow}>
                      <View style={styles.memberIdentity}>
                        <Text style={[styles.memberName, { color: colors.foreground }]}>
                          {event.ruleType === 'phrase' ? 'Banned phrase matched' : 'Unapproved link matched'}
                        </Text>
                        <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                          {event.deletionSucceeded ? 'Removed by Telegram' : 'Telegram could not remove it'}
                        </Text>
                      </View>
                      <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                        {new Date(event.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                No automated moderation actions have been recorded.
              </Text>
            )}
          </View>

          <View
            testID="telegram-community-admin-history"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="clock" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Administrator changes</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Recent protection and riddle setting updates
                </Text>
              </View>
            </View>
            {managementAudit.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Loading administrator history…</Text>
              </View>
            ) : managementAudit.isError ? (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                {errorMessage(managementAudit.error, 'Administrator history is unavailable.')}
              </Text>
            ) : managementAudit.data?.events.length ? (
              <View style={styles.memberList}>
                {managementAudit.data.events.map((event) => (
                  <View key={event.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.memberMainRow}>
                      <View style={styles.memberIdentity}>
                        <Text style={[styles.memberName, { color: colors.foreground }]}>
                          {event.action.replaceAll('_', ' ')}
                        </Text>
                        <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                          {event.actorName}{event.actorUsername ? ` · @${event.actorUsername}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.memberUsername, { color: colors.mutedForeground }]}>
                        {new Date(event.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                No administrator changes have been recorded yet.
              </Text>
            )}
          </View>

          <View
            testID="telegram-community-rule-preview"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="eye" size={18} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Preview protection rules</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Test a sample without posting or saving it
                </Text>
              </View>
            </View>
            <TextInput
              accessibilityLabel="Sample message to test against protection rules"
              testID="telegram-community-rule-preview-input"
              value={previewText}
              onChangeText={(value) => {
                setPreviewText(value);
                setPreviewFeedback(null);
                setPreviewResult(null);
              }}
              placeholder="Paste a sample message"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              style={[
                styles.ruleInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderRadius: colors.radius - 5,
                  color: colors.foreground,
                  minHeight: 96,
                  marginTop: 12,
                  paddingTop: 12,
                  width: '100%',
                },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              testID="telegram-community-rule-preview-submit"
              disabled={previewRules.isPending || !previewText.trim()}
              onPress={() => { void testRulesAgainstSample(); }}
              style={({ pressed }) => [
                styles.riddleToggleButton,
                {
                  backgroundColor: colors.primary,
                  borderRadius: colors.radius - 5,
                  marginTop: 10,
                  opacity: pressed || previewRules.isPending ? 0.72 : !previewText.trim() ? 0.48 : 1,
                },
              ]}
            >
              {previewRules.isPending
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Feather name="search" size={16} color={colors.primaryForeground} />}
              <Text style={[styles.riddleToggleText, { color: colors.primaryForeground }]}>
                {previewRules.isPending ? 'Testing…' : 'Test sample'}
              </Text>
            </Pressable>
            {previewFeedback ? (
              <Text
                accessibilityRole={previewFeedback.tone === 'error' ? 'alert' : 'text'}
                testID="telegram-community-rule-preview-feedback"
                style={[
                  styles.ruleFeedback,
                  { color: previewFeedback.tone === 'error' ? colors.destructive : colors.success },
                ]}
              >
                {previewFeedback.message}
              </Text>
            ) : null}
            {previewResult ? (
              <Text style={[styles.sectionDescription, { color: colors.mutedForeground, marginTop: 6 }]}>
                {previewResult.matchedPhraseRuleIds.length} phrase rule(s) matched · {previewResult.unapprovedLinks.length} unapproved link(s)
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.statsHeading, { color: colors.foreground, marginTop: 0 }]}>Community XP today</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Daily budget and remaining allowance
                </Text>
              </View>
              <ProtectionBadge community={community} />
            </View>
            <CommunityBudget community={community} />
            <GroupStats community={community} />
            <Text style={[styles.budgetNote, { color: colors.mutedForeground }]}>
              Daily budget resets at 00:00 {community.resetTimezone}.
            </Text>
          </View>

          <View
            testID="telegram-community-phrase-rules"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.primary + '12' }]}>
                <Feather name="slash" size={17} color={colors.primary} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Banned phrases</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Matching messages are removed while phrase protection is on.
                </Text>
              </View>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {rules.data?.phraseRules.length ?? 0}
              </Text>
            </View>

            {rules.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Loading saved phrases…</Text>
              </View>
            ) : rules.isError ? (
              <View style={styles.rulesError}>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Saved protection rules couldn’t be loaded.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  testID="telegram-community-rules-retry"
                  onPress={() => { void rules.refetch(); }}
                  style={[styles.ruleRetryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
                >
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : rules.data?.phraseRules.length ? (
              <View style={styles.ruleList}>
                {rules.data.phraseRules.map((rule) => (
                  <View key={rule.id} style={[styles.ruleRow, { borderColor: colors.border }]}>
                    <Text selectable style={[styles.ruleValue, { color: colors.foreground }]}>{rule.phrase}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove banned phrase ${rule.phrase}`}
                      testID={`telegram-community-phrase-remove-${rule.id}`}
                      disabled={removePhrase.isPending}
                      onPress={() => { void deletePhrase(rule.id); }}
                      hitSlop={6}
                      style={({ pressed }) => [styles.removeRuleButton, { opacity: pressed || removePhrase.isPending ? 0.55 : 1 }]}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                      <Text style={[styles.removeRuleText, { color: colors.destructive }]}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>No banned phrases saved yet.</Text>
            )}

            <View style={styles.ruleInputRow}>
              <TextInput
                accessibilityLabel="New banned phrase"
                testID="telegram-community-phrase-input"
                value={phraseDraft}
                onChangeText={(value) => { setPhraseDraft(value); setPhraseFeedback(null); }}
                onSubmitEditing={() => { void savePhrase(); }}
                placeholder="Add a phrase"
                placeholderTextColor={colors.mutedForeground}
                maxLength={80}
                returnKeyType="done"
                style={[
                  styles.ruleInput,
                  { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 5, color: colors.foreground },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                testID="telegram-community-phrase-add"
                disabled={addPhrase.isPending || !phraseDraft.trim()}
                onPress={() => { void savePhrase(); }}
                style={({ pressed }) => [
                  styles.ruleAddButton,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius - 5,
                    opacity: pressed || addPhrase.isPending ? 0.72 : !phraseDraft.trim() ? 0.48 : 1,
                  },
                ]}
              >
                {addPhrase.isPending
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Feather name="plus" size={16} color={colors.primaryForeground} />}
                <Text style={[styles.ruleAddButtonText, { color: colors.primaryForeground }]}>
                  {addPhrase.isPending ? 'Adding…' : 'Add'}
                </Text>
              </Pressable>
            </View>
            {phraseFeedback ? (
              <Text
                accessibilityRole={phraseFeedback.tone === 'error' ? 'alert' : 'text'}
                testID="telegram-community-phrase-feedback"
                style={[
                  styles.ruleFeedback,
                  { color: phraseFeedback.tone === 'error' ? colors.destructive : colors.success },
                ]}
              >
                {phraseFeedback.message}
              </Text>
            ) : null}
          </View>

          <View
            testID="telegram-community-link-rules"
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: colors.success + '16' }]}>
                <Feather name="link" size={17} color={colors.success} />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Whitelisted links</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  {community.spamProtectionEnabled
                    ? 'Saved domains include subdomains, and saved paths include child pages. Other links are removed.'
                    : 'Link filtering is paused while phrase protection is off.'}
                </Text>
              </View>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {rules.data?.linkRules.length ?? 0}
              </Text>
            </View>

            {rules.isLoading ? (
              <View style={styles.rulesLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>Loading trusted links…</Text>
              </View>
            ) : rules.isError ? (
              <View style={styles.rulesError}>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Saved protection rules couldn’t be loaded.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  testID="telegram-community-link-rules-retry"
                  onPress={() => { void rules.refetch(); }}
                  style={[styles.ruleRetryButton, { borderColor: colors.border, borderRadius: colors.radius - 5 }]}
                >
                  <Feather name="refresh-cw" size={14} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : rules.data?.linkRules.length ? (
              <View style={styles.ruleList}>
                {rules.data.linkRules.map((rule) => (
                  <View key={rule.id} style={[styles.ruleRow, { borderColor: colors.border }]}>
                    <Text selectable style={[styles.ruleValue, { color: colors.foreground }]}>{rule.link}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove whitelisted link ${rule.link}`}
                      testID={`telegram-community-link-remove-${rule.id}`}
                      disabled={removeLink.isPending}
                      onPress={() => { void deleteLink(rule.id); }}
                      hitSlop={6}
                      style={({ pressed }) => [styles.removeRuleButton, { opacity: pressed || removeLink.isPending ? 0.55 : 1 }]}
                    >
                      <Feather name="trash-2" size={15} color={colors.destructive} />
                      <Text style={[styles.removeRuleText, { color: colors.destructive }]}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rulesEmpty, { color: colors.mutedForeground }]}>
                No trusted links saved. Unlisted links won’t be removed until you add one.
              </Text>
            )}

            <View style={styles.ruleInputRow}>
              <TextInput
                accessibilityLabel="New whitelisted link"
                testID="telegram-community-link-input"
                value={linkDraft}
                onChangeText={(value) => { setLinkDraft(value); setLinkFeedback(null); }}
                onSubmitEditing={() => { void saveLink(); }}
                placeholder="example.org or a page URL"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={2048}
                returnKeyType="done"
                style={[
                  styles.ruleInput,
                  { backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 5, color: colors.foreground },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                testID="telegram-community-link-add"
                disabled={addLink.isPending || !linkDraft.trim()}
                onPress={() => { void saveLink(); }}
                style={({ pressed }) => [
                  styles.ruleAddButton,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius - 5,
                    opacity: pressed || addLink.isPending ? 0.72 : !linkDraft.trim() ? 0.48 : 1,
                  },
                ]}
              >
                {addLink.isPending
                  ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                  : <Feather name="plus" size={16} color={colors.primaryForeground} />}
                <Text style={[styles.ruleAddButtonText, { color: colors.primaryForeground }]}>
                  {addLink.isPending ? 'Adding…' : 'Add'}
                </Text>
              </Pressable>
            </View>
            {linkFeedback ? (
              <Text
                accessibilityRole={linkFeedback.tone === 'error' ? 'alert' : 'text'}
                testID="telegram-community-link-feedback"
                style={[
                  styles.ruleFeedback,
                  { color: linkFeedback.tone === 'error' ? colors.destructive : colors.success },
                ]}
              >
                {linkFeedback.message}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            ]}
          >
            <View style={styles.dashboardSectionHeader}>
              <View style={[styles.setupIcon, { backgroundColor: community.spamProtectionEnabled ? colors.success + '16' : colors.muted }]}>
                <Feather
                  name="shield"
                  size={18}
                  color={community.spamProtectionEnabled ? colors.success : colors.mutedForeground}
                />
              </View>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Phrase protection {community.spamProtectionEnabled ? 'on' : 'off'}
                </Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  {community.spamProtectionEnabled
                    ? 'The group’s phrase protection is active.'
                    : 'Phrase protection is currently disabled for this group.'}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Manage ${community.chatTitle} in Telegram`}
              testID={`telegram-community-manage-${community.chatId}`}
              onPress={() => onOpenBot(`community_${community.chatId}`)}
              style={({ pressed }) => [
                styles.manageButton,
                { backgroundColor: colors.primary, borderRadius: colors.radius - 5, opacity: pressed ? 0.78 : 1 },
              ]}
            >
              <Feather name="send" size={16} color={colors.primaryForeground} />
              <Text style={[styles.manageButtonText, { color: colors.primaryForeground }]}>Manage in Telegram</Text>
              <Feather name="arrow-up-right" size={15} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      )}
      <View style={{ height: 40 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 32 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 5 },
  setupCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, padding: 13, marginBottom: 18 },
  setupIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  setupCopy: { flex: 1, gap: 4 },
  setupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  setupText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateCard: { alignItems: 'center', borderWidth: 1, padding: 20, gap: 10 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center' },
  stateText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginTop: 3 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  communityList: { gap: 11 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  count: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  communityCard: { borderWidth: 1, padding: 14, marginBottom: 1 },
  addCommunityButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 14 },
  addCommunityButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  communityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  groupIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  communityTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  communityTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  organisationName: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  riddleStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  riddleStatusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  connectionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 8 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 },
  riddleStateBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  connectionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  memberCountText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  settingsShortcut: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  communityDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: -8, marginBottom: 2 },
  connectionNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, padding: 11 },
  connectionNoticeText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  healthMetric: { width: '48%', minHeight: 110, borderWidth: 1, padding: 11 },
  healthIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, marginBottom: 7 },
  healthLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, minHeight: 28 },
  healthValue: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 2 },
  healthDetail: { borderWidth: 1, padding: 12, marginTop: 8, gap: 5 },
  healthDetailTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  protectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  compactProtectionBadge: { paddingHorizontal: 7, paddingVertical: 5 },
  protectionDot: { width: 6, height: 6, borderRadius: 3 },
  protectionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  cardBudget: { marginTop: 12 },
  openDashboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  openDashboardText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  budgetLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  budgetValue: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statsHeading: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 14 },
  statCell: { flex: 1, minWidth: 135, padding: 10, borderRadius: 10, gap: 5 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  budgetNote: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8, marginBottom: 13 },
  manageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  manageButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  dashboardSections: { gap: 12 },
  dashboardCard: { borderWidth: 1, padding: 14 },
  dashboardSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  riddleIntervalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  riddleIntervalButton: { flexBasis: '31%', flexGrow: 1, minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 6 },
  riddleIntervalText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  riddleToggleButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  riddleToggleText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  sectionTitleCopy: { flex: 1, minWidth: 0, gap: 4 },
  rulesLoading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  rulesError: { gap: 9, paddingVertical: 3 },
  ruleRetryButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, borderWidth: 1, paddingHorizontal: 10 },
  rulesEmpty: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, paddingVertical: 3 },
  memberList: { gap: 1 },
  memberRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, gap: 5 },
  memberMainRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  memberRank: { width: 20, fontFamily: 'Inter_600SemiBold', fontSize: 11, textAlign: 'center' },
  memberIdentity: { flex: 1, minWidth: 0, gap: 2 },
  memberName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  memberUsername: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  memberMessageCount: { minWidth: 62, alignItems: 'flex-end', gap: 1 },
  memberMessageValue: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  memberJoinedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 29 },
  memberJoinedText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  ruleList: { gap: 2 },
  ruleRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  ruleValue: { flex: 1, minWidth: 0, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  removeRuleButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3 },
  removeRuleText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  ruleInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  ruleInput: { flex: 1, minWidth: 0, minHeight: 43, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9, fontFamily: 'Inter_400Regular', fontSize: 13 },
  ruleAddButton: { minWidth: 78, minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10 },
  ruleAddButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  ruleFeedback: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 8 },
  sectionDescription: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
});
