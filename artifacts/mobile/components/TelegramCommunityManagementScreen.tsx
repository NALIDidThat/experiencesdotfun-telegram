import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useGetTelegramCommunityManagement,
  type TelegramManagedCommunity,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Props = {
  onBack: () => void;
  onOpenBot: (startPayload?: string) => void;
};

function CommunityCard({
  community,
  onManage,
}: {
  community: TelegramManagedCommunity;
  onManage: () => void;
}) {
  const colors = useColors();
  const progress = community.dailyXpLimit
    ? Math.min(100, Math.round((community.xpAwardedToday / community.dailyXpLimit) * 100))
    : 0;

  return (
    <View
      testID={`telegram-community-${community.chatId}`}
      style={[
        styles.communityCard,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={styles.communityHeader}>
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
        <View
          accessibilityLabel={`Phrase protection ${community.spamProtectionEnabled ? 'on' : 'off'}`}
          style={[
            styles.protectionBadge,
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
            {community.spamProtectionEnabled ? 'Protection on' : 'Protection off'}
          </Text>
        </View>
      </View>

      <View style={styles.budgetHeader}>
        <Text style={[styles.budgetLabel, { color: colors.foreground }]}>Community XP today</Text>
        <Text style={[styles.budgetValue, { color: colors.foreground }]}>
          {community.xpAwardedToday.toLocaleString()} / {community.dailyXpLimit.toLocaleString()}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%`, backgroundColor: progress >= 100 ? colors.accent : colors.primary },
          ]}
        />
      </View>
      <Text style={[styles.budgetNote, { color: colors.mutedForeground }]}>
        {community.dailyXpRemaining.toLocaleString()} XP remaining · resets at 00:00 {community.resetTimezone}
      </Text>
      <Text style={[styles.capNote, { color: colors.mutedForeground }]}>
        Each member can earn up to {community.memberXpLimit} Community XP in this group.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Manage ${community.chatTitle} in Telegram`}
        testID={`telegram-community-manage-${community.chatId}`}
        onPress={onManage}
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
  );
}

export function TelegramCommunityManagementScreen({ onBack, onOpenBot }: Props) {
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
              onManage={() => onOpenBot(`community_${community.chatId}`)}
            />
          ))}
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
  communityHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  groupIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  communityTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  communityTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  organisationName: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  protectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  protectionDot: { width: 6, height: 6, borderRadius: 3 },
  protectionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  budgetLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  budgetValue: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  budgetNote: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 },
  capNote: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 13 },
  manageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  manageButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});
