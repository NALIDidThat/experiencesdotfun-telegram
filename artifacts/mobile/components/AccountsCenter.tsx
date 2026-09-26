import { Feather } from "@expo/vector-icons";
import type { User } from "@workspace/api-client-react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

export type AccountsCenterProps = {
  accounts: User[];
  activeAccountId: number;
  loading: boolean;
  switchingAccountId: number | null;
  error: string | null;
  actionError?: string | null;
  onBack: () => void;
  onSelectAccount: (accountId: number) => void;
  onCreateProfile: () => void;
};

type IconName = keyof typeof Feather.glyphMap;

function withAlpha(color: string, alpha: number) {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) return color;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function useAccountsCenterColors() {
  const theme = useColors();
  return {
    ...theme,
    background: theme.welcome.background,
    foreground: theme.welcome.foreground,
    card: theme.welcome.surface,
    cardForeground: theme.welcome.foreground,
    muted: theme.welcome.surface,
    mutedForeground: theme.welcome.muted,
    border: theme.welcome.border,
  };
}

function accountTypeLabel(account: User) {
  if (account.userType === "organisation") return "Organisation";
  if (account.userType === "participant") return "Participant";
  return "Profile";
}

function accountSubtitle(account: User) {
  if (account.userType === "organisation") {
    return account.organisation?.name || "Organisation profile";
  }
  if (account.username) return `@${account.username}`;
  return "Participant profile";
}

function AccountTypeTile({
  count,
  icon,
  label,
  description,
  color,
}: {
  count: number;
  icon: IconName;
  label: string;
  description: string;
  color: string;
}) {
  const colors = useAccountsCenterColors();

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "profile" : "profiles"}`}
      style={[
        styles.typeTile,
        {
          backgroundColor: withAlpha(color, 0.08),
          borderColor: withAlpha(color, 0.34),
        },
      ]}
    >
      <View style={[styles.typeIcon, { backgroundColor: withAlpha(color, 0.16) }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.typeLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.typeDescription, { color: colors.mutedForeground }]}>
        {description}
      </Text>
      <View style={[styles.countPill, { backgroundColor: withAlpha(color, 0.16) }]}>
        <Text style={[styles.countText, { color }]}>{count} profiles</Text>
      </View>
    </View>
  );
}

function AccountCard({
  account,
  active,
  switching,
  disabled,
  onPress,
}: {
  account: User;
  active: boolean;
  switching: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useAccountsCenterColors();
  const accent = account.userType === "organisation" ? colors.accent : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${account.name}, ${accountTypeLabel(account)}`}
      accessibilityState={{ busy: switching, selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accountCard,
        {
          backgroundColor: active
            ? withAlpha(accent, 0.11)
            : withAlpha(colors.foreground, 0.035),
          borderColor: active ? accent : withAlpha(colors.border, 0.9),
          opacity: pressed || switching ? 0.76 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <UserAvatar
        avatarUrl={account.avatarUrl}
        name={account.name}
        containerStyle={[
          styles.avatar,
          {
            backgroundColor: withAlpha(accent, 0.14),
            borderColor: active ? withAlpha(accent, 0.6) : withAlpha(colors.border, 0.8),
          },
        ]}
        initialStyle={[styles.avatarInitial, { color: accent }]}
      />
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={[styles.accountName, { color: colors.foreground }]}>
          {account.name}
        </Text>
        <Text numberOfLines={1} style={[styles.accountSubtitle, { color: colors.mutedForeground }]}>
          {accountSubtitle(account)}
        </Text>
        <View style={styles.accountMeta}>
          <Feather name={account.userType === "organisation" ? "briefcase" : "user"} size={11} color={accent} />
          <Text style={[styles.accountType, { color: colors.mutedForeground }]}>
            {accountTypeLabel(account)}
          </Text>
        </View>
      </View>
      <View style={styles.accountAction}>
        {switching ? (
          <View style={[styles.switchingMark, { borderColor: withAlpha(accent, 0.45) }]}>
            <View style={[styles.switchingDot, { backgroundColor: accent }]} />
          </View>
        ) : active ? (
          <View style={[styles.activeMark, { backgroundColor: withAlpha(accent, 0.17) }]}>
            <Feather name="check" size={13} color={accent} />
            <Text style={[styles.activeText, { color: accent }]}>Active</Text>
          </View>
        ) : (
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        )}
      </View>
    </Pressable>
  );
}

function SkeletonCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View
      accessible
      accessibilityLabel="Loading profile"
      style={[
        styles.accountCard,
        {
          backgroundColor: withAlpha(colors.foreground, 0.035),
          borderColor: withAlpha(colors.border, 0.85),
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: withAlpha(colors.mutedForeground, 0.16) }]} />
      <View style={styles.skeletonCopy}>
        <View style={[styles.skeletonLine, styles.skeletonName, { backgroundColor: withAlpha(colors.mutedForeground, 0.18) }]} />
        <View style={[styles.skeletonLine, styles.skeletonSubtitle, { backgroundColor: withAlpha(colors.mutedForeground, 0.12) }]} />
        <View style={[styles.skeletonLine, styles.skeletonMeta, { backgroundColor: withAlpha(colors.mutedForeground, 0.12) }]} />
      </View>
      <View style={[styles.skeletonChevron, { backgroundColor: withAlpha(colors.mutedForeground, 0.13) }]} />
    </View>
  );
}

export function AccountsCenter({
  accounts,
  activeAccountId,
  loading,
  switchingAccountId,
  error,
  actionError,
  onBack,
  onSelectAccount,
  onCreateProfile,
}: AccountsCenterProps) {
  const colors = useAccountsCenterColors();
  const participantAccounts = accounts.filter((account) => account.userType === "participant");
  const organisationAccounts = accounts.filter((account) => account.userType === "organisation");
  const otherAccounts = accounts.filter(
    (account) => account.userType !== "participant" && account.userType !== "organisation",
  );
  const hasAccounts = accounts.length > 0;
  const surface = withAlpha(colors.foreground, 0.035);

  const renderGroup = (
    title: string,
    icon: IconName,
    group: User[],
    accent: string,
  ) => {
    if (group.length === 0) return null;

    return (
      <View style={styles.group} key={title}>
        <View style={styles.groupHeader}>
          <View style={[styles.groupIcon, { backgroundColor: withAlpha(accent, 0.14) }]}>
            <Feather name={icon} size={15} color={accent} />
          </View>
          <Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
            {group.length} {group.length === 1 ? "profile" : "profiles"}
          </Text>
        </View>
        <View style={styles.groupList}>
          {group.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              active={account.id === activeAccountId}
              switching={account.id === switchingAccountId}
              disabled={switchingAccountId !== null}
              onPress={() => onSelectAccount(account.id)}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        testID="accounts-center"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="arrow-left" size={21} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.foreground }]}>Accounts Center</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.intro}>
          <View style={[styles.brandMark, { backgroundColor: withAlpha(colors.primary, 0.14) }]}>
            <Feather name="layers" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Your ways to show up</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Switch between the profiles you use to discover, join, and host experiences.
          </Text>
        </View>

        <View style={styles.typeRow}>
          <AccountTypeTile
            count={participantAccounts.length}
            icon="user"
            label="Participant"
            description="Join experiences and meet your community."
            color={colors.primary}
          />
          <AccountTypeTile
            count={organisationAccounts.length}
            icon="briefcase"
            label="Organisation"
            description="Host meaningful activities for others."
            color={colors.accent}
          />
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.errorCard,
              { backgroundColor: withAlpha(colors.destructive, 0.1), borderColor: withAlpha(colors.destructive, 0.35) },
            ]}
          >
            <View style={[styles.errorIcon, { backgroundColor: withAlpha(colors.destructive, 0.14) }]}>
              <Feather name="alert-circle" size={18} color={colors.destructive} />
            </View>
            <View style={styles.errorCopy}>
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Profiles could not load</Text>
              <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back after profile loading error"
                onPress={onBack}
                style={({ pressed }) => [styles.errorAction, { opacity: pressed ? 0.65 : 1 }]}
              >
                <Text style={[styles.errorActionText, { color: colors.destructive }]}>Go back</Text>
              </Pressable>
            </View>
          </View>
        ) : loading ? (
          <View style={styles.group}>
            <View style={styles.groupHeader}>
              <View style={[styles.groupIcon, { backgroundColor: withAlpha(colors.mutedForeground, 0.12) }]} />
              <View style={[styles.loadingHeaderLine, { backgroundColor: withAlpha(colors.mutedForeground, 0.15) }]} />
            </View>
            <View style={styles.groupList}>
              {[0, 1, 2].map((index) => (
                <SkeletonCard key={index} colors={colors} />
              ))}
            </View>
          </View>
        ) : !hasAccounts ? (
          <View style={[styles.emptyCard, { backgroundColor: surface, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: withAlpha(colors.primary, 0.14) }]}>
              <Feather name="user-plus" size={21} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No profiles yet</Text>
            <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
              Create a participant or organisation profile under this sign-in identity.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create a new profile"
              onPress={onCreateProfile}
              style={({ pressed }) => [
                styles.createButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Feather name="plus" size={18} color={colors.primaryForeground} />
              <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Create profile</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.groups}>
            {renderGroup("Participant profiles", "user", participantAccounts, colors.primary)}
            {renderGroup("Organisation profiles", "briefcase", organisationAccounts, colors.accent)}
            {renderGroup("Other profiles", "circle", otherAccounts, colors.mutedForeground)}
          </View>
        )}

        {actionError && !error ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.errorCard,
              { backgroundColor: withAlpha(colors.destructive, 0.1), borderColor: withAlpha(colors.destructive, 0.35) },
            ]}
          >
            <View style={[styles.errorIcon, { backgroundColor: withAlpha(colors.destructive, 0.14) }]}>
              <Feather name="alert-circle" size={18} color={colors.destructive} />
            </View>
            <View style={styles.errorCopy}>
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>Could not switch profiles</Text>
              <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>{actionError}</Text>
            </View>
          </View>
        ) : null}

        {!loading && !error && hasAccounts ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create a new profile"
            onPress={onCreateProfile}
            style={({ pressed }) => [
              styles.createButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Create new profile</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          Profiles stay connected to your existing sign-in identity.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 48,
    paddingTop: 5,
  },
  backButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    marginLeft: -8,
    width: 42,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  topBarSpacer: {
    width: 34,
  },
  intro: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  brandMark: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    marginBottom: 3,
    width: 42,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 330,
    textAlign: "center",
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeTile: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 168,
    padding: 14,
  },
  typeIcon: {
    alignItems: "center",
    borderRadius: 11,
    height: 34,
    justifyContent: "center",
    marginBottom: 12,
    width: 34,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  typeDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    minHeight: 35,
  },
  countPill: {
    alignSelf: "flex-start",
    borderRadius: 20,
    marginTop: 13,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
  },
  groups: {
    gap: 18,
  },
  group: {
    gap: 10,
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  groupIcon: {
    alignItems: "center",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  groupTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  groupCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  groupList: {
    gap: 9,
  },
  accountCard: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 78,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "800",
  },
  accountCopy: {
    flex: 1,
    gap: 2,
    marginLeft: 11,
    minWidth: 0,
  },
  accountName: {
    fontSize: 14,
    fontWeight: "800",
  },
  accountSubtitle: {
    fontSize: 12,
  },
  accountMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  accountType: {
    fontSize: 11,
    fontWeight: "600",
  },
  accountAction: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 8,
    minWidth: 24,
  },
  activeMark: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  activeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  switchingMark: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  switchingDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  skeletonCopy: {
    flex: 1,
    gap: 7,
    marginLeft: 11,
  },
  skeletonLine: {
    borderRadius: 5,
    height: 8,
  },
  skeletonName: {
    width: "52%",
  },
  skeletonSubtitle: {
    width: "37%",
  },
  skeletonMeta: {
    width: "23%",
  },
  skeletonChevron: {
    borderRadius: 8,
    height: 17,
    width: 17,
  },
  loadingHeaderLine: {
    borderRadius: 5,
    height: 10,
    width: 130,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  errorIcon: {
    alignItems: "center",
    borderRadius: 11,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  errorCopy: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  errorMessage: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  errorAction: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 2,
  },
  errorActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 27,
  },
  emptyIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    marginBottom: 13,
    width: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  emptyMessage: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 290,
    textAlign: "center",
  },
  createButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18,
    width: "100%",
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  footerNote: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: -4,
    textAlign: "center",
  },
});

export default AccountsCenter;