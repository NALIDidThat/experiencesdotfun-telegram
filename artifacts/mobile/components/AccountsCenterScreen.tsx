import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  useActivateAccountProfile,
  useCreateAccountProfile,
  useListAccountProfiles,
  type User,
  type UserType,
} from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

type AccountChoice = {
  userType: UserType;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
};

const accountChoices: AccountChoice[] = [
  {
    userType: 'participant',
    title: 'Participant account',
    description: 'Discover and join experiences.',
    icon: 'user',
  },
  {
    userType: 'organisation',
    title: 'Organisation account',
    description: 'Create and manage experiences.',
    icon: 'briefcase',
  },
];

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

function AccountProfileCard({
  profile,
  isCurrent,
  disabled,
  onPress,
}: {
  profile: User;
  isCurrent: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const isOrganisation = profile.userType === 'organisation';
  const title = isOrganisation
    ? profile.organisation?.name || 'Organisation account'
    : profile.name;
  const subtitle = isOrganisation ? 'Organisation account' : 'Participant account';

  return (
    <Pressable
      testID={`account-center-profile-${profile.id}`}
      accessibilityRole="button"
      accessibilityLabel={isCurrent ? `${subtitle}, current profile` : `Switch to ${subtitle}`}
      accessibilityHint={isCurrent ? undefined : 'Activates this profile under your current login.'}
      accessibilityState={{ disabled: isCurrent || disabled, selected: isCurrent }}
      disabled={isCurrent || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileCard,
        {
          backgroundColor: colors.card,
          borderColor: isCurrent ? colors.primary : colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <View style={[styles.profileIcon, { backgroundColor: colors.primary + '12' }]}>
        <Feather name={isOrganisation ? 'briefcase' : 'user'} size={19} color={colors.primary} />
      </View>
      <View style={styles.profileCopy}>
        <Text numberOfLines={1} style={[styles.profileTitle, { color: colors.foreground }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.profileSubtitle, { color: colors.mutedForeground }]}>
          {subtitle}{profile.city ? ` · ${profile.city}` : ''}
        </Text>
      </View>
      {isCurrent ? (
        <View style={[styles.currentBadge, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="check" size={13} color={colors.primary} />
          <Text style={[styles.currentBadgeText, { color: colors.primary }]}>Current</Text>
        </View>
      ) : (
        <View style={styles.switchAction}>
          <Text style={[styles.switchActionText, { color: colors.primary }]}>Switch</Text>
          <Feather name="chevron-right" size={17} color={colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

export function AccountsCenterScreen({ onBack }: { onBack: () => void }) {
  const colors = useColors();
  const { user, activateProfileSession } = useAuth();
  const accounts = useListAccountProfiles();
  const createProfile = useCreateAccountProfile();
  const activateProfile = useActivateAccountProfile();
  const [choosingType, setChoosingType] = useState(false);
  const [creatingType, setCreatingType] = useState<UserType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = createProfile.isPending || activateProfile.isPending;
  const profiles = [...(accounts.data?.accounts ?? [])].sort(
    (first, second) => Number(second.id === user?.id) - Number(first.id === user?.id),
  );

  const handleCreate = async (userType: UserType) => {
    setError(null);
    setCreatingType(userType);
    try {
      const response = await createProfile.mutateAsync({ data: { userType } });
      const activated = await activateProfileSession(response);
      if (!activated) {
        void accounts.refetch();
        setError('The profile was created, but could not be activated. It is still listed here; select it to try again.');
        return;
      }
      setChoosingType(false);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, 'The profile could not be created. Please try again.'));
    } finally {
      setCreatingType(null);
    }
  };

  const handleActivate = async (accountId: number) => {
    setError(null);
    try {
      const response = await activateProfile.mutateAsync({ accountId });
      const activated = await activateProfileSession(response);
      if (!activated) {
        setError('This profile could not be activated. Your current profile is unchanged.');
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, 'This profile could not be activated. Your current profile is unchanged.'));
    }
  };

  return (
    <ScrollView
      testID="accounts-center-screen"
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable
          testID="accounts-center-back"
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Accounts Centre</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Manage your profiles</Text>
        </View>
      </View>

      <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={[styles.introIcon, { backgroundColor: colors.primary + '12' }]}>
          <Feather name="users" size={19} color={colors.primary} />
        </View>
        <View style={styles.introCopy}>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>One login, separate profiles</Text>
          <Text style={[styles.introBody, { color: colors.mutedForeground }]}>
            Your Participant and Organisation profiles keep their own details and activity.
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YOUR PROFILES</Text>
      {accounts.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading profiles…</Text>
        </View>
      ) : accounts.isError ? (
        <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>Your profiles could not be loaded.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => { void accounts.refetch(); }}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, borderRadius: colors.radius - 4, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="refresh-cw" size={15} color={colors.primary} />
            <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : profiles.length ? (
        <View style={styles.profileList}>
          {profiles.map((profile) => (
            <AccountProfileCard
              key={profile.id}
              profile={profile}
              isCurrent={profile.id === user?.id}
              disabled={busy}
              onPress={() => { void handleActivate(profile.id); }}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>No profiles are available for this login.</Text>
      )}

      {error ? <Text accessibilityRole="alert" style={[styles.errorMessage, { color: colors.destructive }]}>{error}</Text> : null}

      {choosingType ? (
        <View style={styles.addSection}>
          <View style={styles.addHeading}>
            <Text style={[styles.addTitle, { color: colors.foreground }]}>Choose a profile type</Text>
            <Pressable
              testID="accounts-center-cancel-add"
              accessibilityRole="button"
              accessibilityLabel="Cancel adding a profile"
              disabled={busy}
              onPress={() => setChoosingType(false)}
              style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="x" size={19} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {accountChoices.map((choice) => (
            <Pressable
              key={choice.userType}
              testID={`accounts-center-add-${choice.userType}`}
              accessibilityRole="button"
              accessibilityLabel={`Add ${choice.title}`}
              accessibilityHint={choice.description}
              disabled={busy}
              onPress={() => { void handleCreate(choice.userType); }}
              style={({ pressed }) => [
                styles.choiceCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  opacity: busy ? 0.55 : pressed ? 0.72 : 1,
                },
              ]}
            >
              <View style={[styles.profileIcon, { backgroundColor: colors.primary + '12' }]}>
                {busy && creatingType === choice.userType ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name={choice.icon} size={19} color={colors.primary} />
                )}
              </View>
              <View style={styles.profileCopy}>
                <Text style={[styles.profileTitle, { color: colors.foreground }]}>{choice.title}</Text>
                <Text style={[styles.profileSubtitle, { color: colors.mutedForeground }]}>{choice.description}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable
          testID="accounts-center-add-account"
          accessibilityRole="button"
          accessibilityLabel="Add another profile"
          onPress={() => { setError(null); setChoosingType(true); }}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <Feather name="plus" size={18} color={colors.primaryForeground} />
          <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Add an account</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  introCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderWidth: 1 },
  introIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 4 },
  introTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  introBody: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  sectionLabel: { marginBottom: -8, fontSize: 10, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  profileList: { gap: 10 },
  profileCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1 },
  profileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, minWidth: 0, gap: 3 },
  profileTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  profileSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
  currentBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  switchAction: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  switchActionText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  loading: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  errorCard: { alignItems: 'flex-start', gap: 12, padding: 14, borderWidth: 1 },
  errorText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  errorMessage: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, borderWidth: 1 },
  secondaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  addSection: { gap: 10 },
  addHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  cancelButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  choiceCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1 },
  addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  addButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});