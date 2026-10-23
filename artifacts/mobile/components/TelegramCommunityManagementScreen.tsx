import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  useGetTelegramCommunityLiveInfo,
  useGetTelegramCommunityManagement,
  type TelegramManagedCommunity,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

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
      accessibilityLabel={`${community.chatTitle}, ${community.organisationName}. ${community.xpAwardedToday.toLocaleString()} of ${community.dailyXpLimit.toLocaleString()} Community XP used today. ${community.spamProtectionEnabled ? 'Phrase protection on.' : 'Phrase protection off.'} Open group dashboard`}
      accessibilityHint="Opens this linked group's Community XP and protection dashboard"
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
            Check protection and XP budgets, then manage group controls in the bot.
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
  const [selectedMetric, setSelectedMetric] = useState<HealthMetricKey | null>(null);
  const management = useGetTelegramCommunityManagement();
  const liveInfo = useGetTelegramCommunityLiveInfo(chatId ?? '', {
    query: {
      queryKey: ['/api/community/manage', chatId, 'live-info'],
      enabled: Boolean(chatId),
    },
  });
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
          label: 'Pending reviews',
          value: 'Not tracked',
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
      title: 'Moderation reviews',
      body: 'A saved review inbox is not available yet. Phrase protection currently removes configured matches automatically when the bot has Telegram permission to delete messages.',
    },
    xp: {
      title: 'XP distributed today',
      body: `${community?.xpAwardedToday.toLocaleString() ?? '0'} of ${community?.dailyXpLimit.toLocaleString() ?? '0'} XP used. ${community?.dailyXpRemaining.toLocaleString() ?? '0'} XP remains before the 00:00 UTC reset.`,
    },
  };

  return (
    <ScrollView
      testID="telegram-community-dashboard-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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

          <View>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionTitleCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Community health</Text>
                <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
                  Today’s recorded activity and reviews
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
    </ScrollView>
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
  communityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  groupIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  communityTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  communityTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  organisationName: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  connectionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 8 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 },
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
  sectionTitleCopy: { flex: 1, minWidth: 0, gap: 4 },
  sectionDescription: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
});
