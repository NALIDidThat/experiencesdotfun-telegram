import React from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getGetOrganisationTreasuryQueryKey,
  getListOrganisationFundsQueryKey,
  useGetHostOverview,
  useGetOrganisationTreasury,
  useListHostExperiences,
  useListOrganisationFunds,
} from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { UserAvatar } from '@/components/UserAvatar';
import { LinearGradient } from '@/components/LinearGradient';
import { selectOrganisationHomePriority } from '@/lib/home-priority';

type Props = {
  user: User;
  go: (screen: 'profile' | 'host' | 'host-detail' | 'create' | 'funds' | 'campaigns' | 'notifications', params?: Record<string, string>) => void;
};

export function OrganisationHomeScreen({ user, go }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isCharity = user.organisation?.type === 'charity';
  const overview = useGetHostOverview();
  const experiences = useListHostExperiences();
  const funds = useListOrganisationFunds(user.id, {
    query: {
      queryKey: getListOrganisationFundsQueryKey(user.id),
      enabled: isCharity && Number.isSafeInteger(user.id) && user.id > 0,
      retry: false,
    },
  });
  const treasury = useGetOrganisationTreasury(
    { limit: 1 },
    { query: { queryKey: getGetOrganisationTreasuryQueryKey({ limit: 1 }), enabled: isCharity, retry: false } },
  );
  const org = overview.data?.organisation ?? user.organisation;
  const hostedExperiences = experiences.data ?? [];
  const activeExperiences = hostedExperiences.filter((item) => ['published', 'full'].includes(item.status));
  const reviewCount = overview.data?.pendingVerifications ?? 0;
  const priority = selectOrganisationHomePriority({
    overviewLoading: overview.isLoading,
    overviewError: overview.isError,
    pendingReviews: overview.data?.pendingVerifications,
    totalExperiences: overview.data?.totalExperiences,
    experiences: experiences.data,
    experiencesLoading: experiences.isLoading,
    experiencesError: experiences.isError,
    isCharity,
    funds: funds.data,
    fundsLoading: funds.isLoading,
    fundsError: funds.isError,
  });
  const formatDate = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const refresh = () => {
    void Promise.all([
      overview.refetch(),
      experiences.refetch(),
      ...(isCharity ? [treasury.refetch(), funds.refetch()] : []),
    ]);
  };
  const openHost = () => go('host');
  const openPriority = () => {
    switch (priority.action) {
      case 'retry-overview':
        void overview.refetch();
        return;
      case 'retry-experiences':
        void experiences.refetch();
        return;
      case 'retry-funds':
        void funds.refetch();
        return;
      case 'host':
        go('host');
        return;
      case 'experience':
        if (priority.experienceId) go('host-detail', { id: String(priority.experienceId) });
        return;
      case 'create':
        go('create');
        return;
      case 'funds':
        go('funds');
        return;
      case 'campaign':
        if (priority.fundId) go('campaigns', { id: String(priority.fundId) });
        else go('campaigns');
        return;
    }
  };

  const sectionTitle = (title: string, action?: string, onAction?: () => void) => (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.textAction}>
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{action}</Text>
          <Feather name="arrow-right" size={14} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );

  const workspace = [
    { title: 'Experiences', detail: overview.isLoading ? 'Loading…' : overview.isError ? 'Unavailable' : `${overview.data?.upcomingExperiences ?? 0} active · ${overview.data?.totalExperiences ?? 0} total`, icon: 'calendar' as const, tint: colors.primary, target: 'host' as const },
    { title: 'Reviews', detail: overview.isLoading ? 'Loading…' : overview.isError ? 'Unavailable' : `${reviewCount} awaiting review`, icon: 'users' as const, tint: colors.teal, target: 'host' as const },
    { title: isCharity ? 'Fundraising' : 'Organisation profile', detail: isCharity ? 'Manage charity campaigns' : 'View profile and verification', icon: isCharity ? 'bar-chart-2' as const : 'briefcase' as const, tint: colors.secondary, target: isCharity ? 'funds' as const : 'profile' as const },
    ...(isCharity ? [{ title: 'Treasury', detail: treasury.isLoading ? 'Checking balance…' : treasury.isError ? 'Balance unavailable' : `${treasury.data?.balanceSol ?? '—'} SOL on-chain`, icon: 'credit-card' as const, tint: colors.primary, target: 'funds' as const }] : []),
  ];

  return (
    <ScrollView
      testID="organisation-home"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, {
        paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top + 8,
        paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 24),
      }]}
      refreshControl={<RefreshControl refreshing={overview.isRefetching || experiences.isRefetching || treasury.isRefetching || funds.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}>
        <Text style={[styles.brand, { color: colors.foreground }]}>Experiences<Text style={{ color: colors.primary }}>.fun</Text></Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={() => go('notifications')} style={styles.bell}>
          <Feather name="bell" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={styles.profileRow}>
        <UserAvatar
          avatarUrl={user.avatarUrl}
          name={org?.name ?? user.name}
          containerStyle={[styles.avatar, { backgroundColor: colors.muted }]}
          initialStyle={{ color: colors.primary, fontFamily: 'Inter_700Bold' }}
        />
        <View style={styles.profileCopy}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},</Text>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.orgName, { color: colors.foreground }]}>{org?.name ?? user.name}</Text>
            {org?.verified ? <Feather name="check-circle" size={17} color={colors.accent} /> : null}
          </View>
          <Text numberOfLines={1} style={[styles.orgMeta, { color: colors.mutedForeground }]}>
            {(org?.type ?? 'Organisation').replace(/_/g, ' ')}{org?.city ? ` · ${org.city}${org.country ? `, ${org.country}` : ''}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit organisation profile" onPress={() => go('profile')} style={[styles.editButton, { borderColor: colors.border }]}>
          <Feather name="edit-2" size={14} color={colors.foreground} />
          <Text style={[styles.editText, { color: colors.foreground }]}>Edit</Text>
        </Pressable>
      </View>

      {sectionTitle('Your next action')}
      <Pressable
        testID="organisation-home-priority"
        accessibilityRole="button"
        accessibilityLabel={`${priority.title}. ${priority.detail} ${priority.buttonLabel}.`}
        accessibilityState={{ disabled: priority.kind === 'loading' }}
        disabled={priority.kind === 'loading'}
        onPress={openPriority}
        style={({ pressed }) => [
          styles.attentionCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.78 : 1,
          },
        ]}
      >
        <View style={[styles.workspaceIcon, {
          backgroundColor: priority.kind === 'error' ? `${colors.destructive}18` : `${colors.primary}18`,
        }]}>
          {priority.kind === 'loading'
            ? <ActivityIndicator color={colors.primary} />
            : <Feather
                name={priority.icon}
                size={19}
                color={priority.kind === 'error' ? colors.destructive : colors.primary}
              />}
        </View>
        <View style={styles.workspaceCopy}>
          <Text style={[styles.workspaceTitle, { color: colors.foreground }]}>{priority.title}</Text>
          <Text style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>{priority.detail}</Text>
          <Text style={[styles.actionText, { color: colors.primary }]}>{priority.buttonLabel}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>

      {isCharity ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open community treasury"
          onPress={() => go('funds')}
          style={({ pressed }) => [styles.treasuryCard, { opacity: pressed ? 0.94 : 1 }]}
        >
          <LinearGradient colors={[colors.foreground, colors.secondary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.treasuryTop}>
            <View style={styles.treasuryTitleRow}>
              <Feather name="database" size={17} color={colors.primaryForeground} />
              <Text style={[styles.treasuryTitle, { color: colors.primaryForeground }]}>Community treasury</Text>
            </View>
            <View style={styles.treasuryOpen}><Text style={[styles.treasuryOpenText, { color: colors.primaryForeground }]}>View treasury</Text><Feather name="arrow-right" size={13} color={colors.primaryForeground} /></View>
          </View>
          {treasury.isLoading ? (
            <View style={styles.balanceRow}><ActivityIndicator color={colors.primaryForeground} /><Text style={[styles.treasurySub, { color: colors.primaryForeground }]}>Checking on-chain balance…</Text></View>
          ) : treasury.data ? (
            <>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.balance, { color: colors.primaryForeground }]}>{treasury.data.balanceSol} SOL</Text>
              <Text style={[styles.treasurySub, { color: colors.primaryForeground }]}>On-chain balance · Solana {treasury.data.treasury.cluster === 'mainnet-beta' ? 'Mainnet' : treasury.data.treasury.cluster}</Text>
            </>
          ) : (
            <Text style={[styles.unavailable, { color: colors.primaryForeground }]}>{treasury.isError ? 'Balance unavailable. Open treasury to check or register a wallet.' : 'Treasury balance not available.'}</Text>
          )}
          {treasury.data?.checkedAt ? <Text style={[styles.checkedAt, { color: colors.primaryForeground }]}>Updated {new Date(treasury.data.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text> : null}
        </Pressable>
      ) : null}

      {sectionTitle('Your workspace', 'Manage organisation', () => go('profile'))}
      <View style={styles.workspaceGrid}>
        {workspace.map((item) => (
          <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`${item.title}: ${item.detail}`} onPress={() => go(item.target)} style={({ pressed }) => [styles.workspaceCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.workspaceIcon, { backgroundColor: `${item.tint}18` }]}><Feather name={item.icon} size={19} color={item.tint} /></View>
            <View style={styles.workspaceCopy}><Text numberOfLines={1} style={[styles.workspaceTitle, { color: colors.foreground }]}>{item.title}</Text><Text numberOfLines={2} style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>{item.detail}</Text></View>
            <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>

      {sectionTitle('Impact this month')}
      <View style={[styles.impactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.workspaceIcon, { backgroundColor: `${colors.secondary}18` }]}><Feather name="activity" size={19} color={colors.secondary} /></View>
        <View style={styles.workspaceCopy}>
          {overview.isLoading ? (
            <ActivityIndicator color={colors.secondary} />
          ) : overview.isError ? (
            <Text style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>Impact metrics couldn’t load. Pull to refresh and try again.</Text>
          ) : (
            <>
              <Text style={[styles.impactMetric, { color: colors.foreground }]}>{overview.data?.monthlyVerifiedCompletions ?? 0}</Text>
              <Text style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>Host-verified completions this month · UTC</Text>
            </>
          )}
        </View>
      </View>

      {sectionTitle('Your active experiences', 'View all', openHost)}
      {experiences.isLoading ? (
        <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}><ActivityIndicator color={colors.primary} /><Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Loading hosted experiences…</Text></View>
      ) : experiences.isError ? (
        <Pressable accessibilityRole="button" onPress={() => void experiences.refetch()} style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="alert-circle" size={18} color={colors.destructive} /><Text style={[styles.noticeText, { color: colors.foreground }]}>Experiences couldn’t load. Tap to retry.</Text></Pressable>
      ) : activeExperiences.length ? (
        activeExperiences.slice(0, 3).map((experience) => {
          const date = formatDate(experience.date);
          return (
            <Pressable key={experience.id} accessibilityRole="button" accessibilityLabel={`Open ${experience.title}, ${experience.city}, ${experience.status}`} onPress={() => go('host-detail', { id: String(experience.id) })} style={({ pressed }) => [styles.experienceCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
              <View style={[styles.experienceArtwork, { backgroundColor: `${colors.teal}18` }]}><Feather name="calendar" size={21} color={colors.teal} /></View>
              <View style={styles.workspaceCopy}><Text numberOfLines={1} style={[styles.workspaceTitle, { color: colors.foreground }]}>{experience.title}</Text><Text numberOfLines={1} style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>{experience.city} · {experience.participantCount} participants</Text><Text style={[styles.workspaceDetail, { color: colors.mutedForeground }]}>{experience.status.replace(/_/g, ' ')}{date ? ` · ${date}` : ''}</Text></View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </Pressable>
          );
        })
      ) : (
        <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="calendar" size={18} color={colors.mutedForeground} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>No active experiences yet.</Text>
          <Pressable accessibilityRole="button" onPress={() => go('create')}><Text style={[styles.actionText, { color: colors.primary }]}>Create one</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  brandRow: { height: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 21, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  profileRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  profileCopy: { flex: 1, minWidth: 0, gap: 2 },
  greeting: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orgName: { flexShrink: 1, fontSize: 17, fontFamily: 'Inter_700Bold' },
  orgMeta: { fontSize: 11, textTransform: 'capitalize', fontFamily: 'Inter_400Regular' },
  editButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 11 },
  editText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  treasuryCard: { minHeight: 152, overflow: 'hidden', borderRadius: 22, padding: 17, gap: 4 },
  treasuryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  treasuryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  treasuryTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  treasuryOpen: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.13)' },
  treasuryOpenText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  balance: { fontSize: 32, lineHeight: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 8 },
  treasurySub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18 },
  unavailable: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium', marginTop: 18 },
  checkedAt: { color: 'rgba(255,255,255,0.68)', fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 4 },
  sectionHeading: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { fontSize: 18, letterSpacing: -0.3, fontFamily: 'Inter_700Bold' },
  textAction: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  workspaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workspaceCard: { minHeight: 76, width: '48%', flexGrow: 1, flexBasis: '44%', borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  workspaceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  workspaceCopy: { flex: 1, minWidth: 0, gap: 3 },
  workspaceTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  workspaceDetail: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  noticeCard: { minHeight: 58, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  attentionCard: { minHeight: 78, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  impactCard: { minHeight: 78, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  impactMetric: { fontSize: 24, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  experienceCard: { minHeight: 80, borderWidth: 1, borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  experienceArtwork: { width: 62, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

