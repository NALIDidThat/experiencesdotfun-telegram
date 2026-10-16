import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Share, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHostOverviewQueryKey,
  getGetOrganisationTreasuryQueryKey,
  getListOrganisationFundsQueryKey,
  useCreateOrganisationFund,
  useGetHostOverview,
  useGetOrganisationTreasury,
  useListOrganisationFunds,
  useRegisterOrganisationTreasury,
} from "@workspace/api-client-react";
import type { HostOverview, OrganisationFund, OrganisationTreasuryDashboard, OrganisationTreasuryInput } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { ContributeToFund } from "@/components/fundraising/ContributionCheckout";
import { CharityLedgerSection } from "@/components/fundraising/CharityLedger";
import { CharityPayoutsSection } from "@/components/fundraising/Payouts";
import { FundOwnerControls, FundStats } from "@/components/fundraising/FundOwnerControls";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { isValidSolanaAddress } from "@/lib/solana-pay.mjs";

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function solscanUrl(path: string, cluster: string) {
  return `https://solscan.io/${path}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

function transactionDateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function campaignProgress(fund: OrganisationFund) {
  const goal = Number(fund.goalSol);
  const raised = Number(fund.raisedSol);
  return Number.isFinite(goal) && goal > 0 && Number.isFinite(raised)
    ? Math.max(0, Math.min(100, raised / goal * 100))
    : 0;
}

function CampaignProgressCard({ fund, onPress }: { fund: OrganisationFund; onPress: () => void }) {
  const colors = useColors();
  const progress = campaignProgress(fund);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Track ${fund.title}: ${fund.raisedSol} SOL raised of ${fund.goalSol} SOL goal`}
      testID={`campaign-progress-${fund.id}`}
      onPress={onPress}
      style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 15, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}>
          <Feather name="heart" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 15, lineHeight: 20, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
          {fund.experienceTitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>For {fund.experienceTitle}</Text>
            </View>
          ) : null}
        </View>
        <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
      </View>
      <View style={{ gap: 7 }}>
        <View style={{ height: 7, overflow: "hidden", borderRadius: 8, backgroundColor: colors.muted }}>
          <View accessibilityRole="progressbar" accessibilityLabel={`${Math.round(progress)}% of campaign goal`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={{ width: `${progress}%`, height: "100%", borderRadius: 8, backgroundColor: colors.primary }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>{fund.raisedSol} SOL raised</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{fund.goalSol.toLocaleString()} SOL goal</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{fund.contributionCount} verified {fund.contributionCount === 1 ? "deposit" : "deposits"} · {Math.round(progress)}% funded</Text>
      </View>
    </Pressable>
  );
}

function ExpandableMetric({
  label,
  value,
  detail,
  icon,
  expanded,
  onPress,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof Feather.glyphMap;
  expanded: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ expanded }}
      testID={`treasury-metric-${label.toLowerCase().replaceAll(" ", "-")}`}
      onPress={onPress}
      style={{ flex: 1, minWidth: "46%", borderWidth: 1, borderColor: expanded ? colors.primary + "55" : colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 14, gap: 11 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon} size={15} color={colors.primary} />
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
      </View>
      <View style={{ gap: 3 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>{value}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.35 }}>{label}</Text>
      </View>
      {expanded ? <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{detail}</Text> : null}
    </Pressable>
  );
}

function FundCard({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, overflow: "hidden" }}>
      <View style={{ padding: 15, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 19, lineHeight: 25, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="briefcase" size={13} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{fund.organisationName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: `${colors.primary}12`, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Feather name="target" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Goal · {fund.goalSol.toLocaleString()} SOL</Text>
          </View>
        </View>

        <View style={{ gap: 3 }}>
          <Text numberOfLines={descriptionExpanded ? undefined : 3} style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{fund.description}</Text>
          {fund.description.length > 150 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={descriptionExpanded ? "Show less campaign information" : "Read full campaign information"}
              accessibilityState={{ expanded: descriptionExpanded }}
              testID={`fund-description-toggle-${fund.id}`}
              onPress={() => setDescriptionExpanded((expanded) => !expanded)}
              style={{ minHeight: 44, alignSelf: "flex-start", justifyContent: "center" }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{descriptionExpanded ? "Show less" : "Read more"}</Text>
            </Pressable>
          ) : null}
        </View>

        <FundStats fund={fund} />
        <ContributeToFund fund={fund} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="shield" size={13} color={colors.mutedForeground} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
              Shared charity treasury · Solana {fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${fund.organisationName} treasury address on Solana ${fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}`}
              testID={`fund-treasury-share-${fund.id}`}
              onPress={() => {
                void Share.share({ message: `${fund.organisationName} shared charity treasury\nSolana ${fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}\n${fund.walletAddress}` })
                  .catch(() => Alert.alert("Unable to share treasury address", "You can select and copy the address below."));
              }}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="share" size={15} color={colors.primary} />
            </Pressable>
          </View>
          <Text selectable style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium" }}>{fund.walletAddress}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>
            Approve in your wallet. Contributions are verified on chain before they count; confirmed transfers can’t be reversed.
          </Text>
        </View>
      </View>
    </View>
  );
}

export function OrganisationFundraiserSection({
  organisationUserId,
  canLaunch = false,
  onLaunch,
}: {
  organisationUserId: number;
  canLaunch?: boolean;
  onLaunch?: () => void;
}) {
  const colors = useColors();
  const query = useListOrganisationFunds(organisationUserId, {
    query: { queryKey: getListOrganisationFundsQueryKey(organisationUserId), enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0 },
  });
  if (query.isLoading && !canLaunch) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading fundraisers" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading fundraisers…</Text>
      </View>
    );
  }
  if (query.isError && !query.data?.length && !canLaunch) {
    return (
      <View style={{ marginVertical: 12, gap: 7 }}>
        <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12 }}>Fundraisers could not be loaded.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading fundraisers" onPress={() => { void query.refetch(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!query.isLoading && !query.isError && !query.data?.length && !canLaunch) return null;
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>{canLaunch ? "Your fundraisers" : "Support their work"}</Text>
          {query.data?.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{query.data.length} {query.data.length === 1 ? "campaign" : "campaigns"}</Text> : null}
        </View>
        {canLaunch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Launch a charity fund"
            testID="launch-charity-fund"
            onPress={onLaunch}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8 }}
          >
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Launch fund</Text>
          </Pressable>
        ) : null}
      </View>
      {query.isLoading ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading fundraisers" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading fundraisers…</Text>
        </View>
      ) : null}
      {query.isError ? (
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>Fundraisers could not be loaded.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading fundraisers" onPress={() => { void query.refetch(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {query.data?.map((fund) => <FundCard key={fund.id} fund={fund} />)}
      {!query.isLoading && !query.isError && !query.data?.length && canLaunch ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>No active funds yet. Set up the charity treasury to invite SOL donations.</Text>
      ) : null}
    </View>
  );
}

export function OrganisationFundsScreen({
  organisationUserId,
  onBack,
  onOpenCampaign,
  initialView = "treasury",
  initialExperienceId,
  initialExperienceTitle,
  initialFundId,
}: {
  organisationUserId: number;
  onBack: () => void;
  onOpenCampaign?: (fundId?: number) => void;
  initialView?: "treasury" | "campaigns";
  initialExperienceId?: number;
  initialExperienceTitle?: string;
  initialFundId?: number;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalSol, setGoalSol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [treasuryAddress, setTreasuryAddress] = useState("");
  const [cluster, setCluster] = useState<OrganisationTreasuryInput["cluster"]>("mainnet-beta");
  const [before, setBefore] = useState<string | undefined>();
  const [loadedTransactions, setLoadedTransactions] = useState<OrganisationTreasuryDashboard["transactions"]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [stage, setStage] = useState<"dashboard" | "campaigns" | "create" | "success" | "detail">(
    initialView === "campaigns" ? (initialFundId ? "detail" : "campaigns") : (initialExperienceId ? "create" : "dashboard"),
  );
  const [createdFund, setCreatedFund] = useState<OrganisationFund | null>(null);
  const [selectedFund, setSelectedFund] = useState<OrganisationFund | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<"active" | "all" | "closed">("active");
  const [experienceIdToAttach, setExperienceIdToAttach] = useState<number | undefined>(initialExperienceId);
  const hostOverviewQuery = useGetHostOverview({
    query: {
      queryKey: getGetHostOverviewQueryKey(),
      enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0,
    },
  });
  const treasuryQuery = useGetOrganisationTreasury({ limit: 20, before }, {
    query: {
      queryKey: getGetOrganisationTreasuryQueryKey({ limit: 20, before }),
      staleTime: 15_000,
      retry: false,
    },
  });
  const fundsQuery = useListOrganisationFunds(organisationUserId, {
    query: {
      queryKey: getListOrganisationFundsQueryKey(organisationUserId),
      enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0,
    },
  });
  const selectedFundFromRoute = initialFundId ? fundsQuery.data?.find((fund) => fund.id === initialFundId) : undefined;
  const register = useRegisterOrganisationTreasury();
  const create = useCreateOrganisationFund({ mutation: { onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
  } } });
  const field = (label: string, value: string, setValue: (next: string) => void, placeholder: string, multiline = false) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => { setValue(next); setError(null); }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        accessibilityLabel={label}
        style={{ minHeight: multiline ? 112 : 50, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, backgroundColor: colors.card, textAlignVertical: multiline ? "top" : "center" }}
      />
    </View>
  );
  const button = (label: string, action: () => void, secondary = false, disabled = false, icon?: keyof typeof Feather.glyphMap) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={{ minHeight: 50, borderRadius: colors.radius - 4, paddingHorizontal: 16, backgroundColor: secondary ? colors.card : colors.primary, borderWidth: secondary ? 1 : 0, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled ? 0.55 : 1 }}
    >
      {icon ? <Feather name={icon} size={16} color={secondary ? colors.foreground : colors.primaryForeground} /> : null}
      <Text style={{ color: secondary ? colors.foreground : colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  const header = (titleText: string, subtitle: string, backAction: () => void, backLabel: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={backAction} style={{ width: 40, height: 40, justifyContent: "center" }}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.foreground, fontSize: 21, fontFamily: "Inter_700Bold" }}>{titleText}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{subtitle}</Text>
      </View>
    </View>
  );
  const allTransactions = [...loadedTransactions, ...(treasuryQuery.data?.transactions ?? [])];
  const visibleTransactions = activityExpanded ? allTransactions : allTransactions.slice(0, 5);
  const returnToStage = initialView === "campaigns" ? "campaigns" : "dashboard";

  if (stage === "detail" && initialFundId && fundsQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Loading verified campaign progress…", onBack, "Back to campaign tracker")}
        <View accessibilityRole="progressbar" style={{ padding: 20 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }
  if (stage === "detail" && initialFundId && fundsQuery.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Campaign progress could not be loaded.", onBack, "Back to campaign tracker")}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19 }}>We couldn’t verify this campaign right now.</Text>
          {button("Try again", () => { void fundsQuery.refetch(); }, true, false, "refresh-cw")}
          {button("Back to campaigns", onBack, true, false, "arrow-left")}
        </View>
      </View>
    );
  }
  if (stage === "detail" && initialFundId && !fundsQuery.isLoading && !fundsQuery.isError && !selectedFundFromRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "This campaign is not available.", onBack, "Back to campaign tracker")}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>It may have been removed or may belong to another charity.</Text>
          {button("Back to campaigns", onBack, true, false, "arrow-left")}
        </View>
      </View>
    );
  }

  if (stage === "success" && createdFund) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Fund created", "Your campaign is live and ready to share.", () => setStage(returnToStage), "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 34, gap: 18 }}>
          <View style={{ alignItems: "center", paddingVertical: 26, gap: 12 }}>
            <View style={{ width: 74, height: 74, borderRadius: 28, backgroundColor: colors.primary + "16", alignItems: "center", justifyContent: "center" }}>
              <Feather name="check" size={34} color={colors.primary} />
            </View>
            <Text style={{ color: colors.foreground, fontSize: 27, fontFamily: "Inter_700Bold", textAlign: "center" }}>Fund created!</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: "center" }}>Your campaign is now live and will receive donations at your charity treasury address.</Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, gap: 9 }}>
            <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>{createdFund.title}</Text>
            {createdFund.experienceTitle ? <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>For {createdFund.experienceTitle}</Text> : null}
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{createdFund.description}</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Goal · {createdFund.goalSol.toLocaleString()} SOL</Text>
          </View>
          {button("View fund", () => { setSelectedFund(createdFund); setStage("detail"); }, false, false, "arrow-right")}
          {button("Share fund", () => {
            void Share.share({ message: `${createdFund.title}\n\n${createdFund.description}\n\nGoal: ${createdFund.goalSol.toLocaleString()} SOL\nDonate to the charity treasury: ${createdFund.walletAddress}` });
          }, true, false, "share-2")}
          {button(initialView === "campaigns" ? "Back to campaign tracker" : "Back to funds dashboard", () => setStage(returnToStage), true)}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "create") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Launch a fund", "Create a new campaign for your community.", () => { setError(null); setStage(returnToStage); }, "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 34, gap: 17 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
          <View style={{ borderRadius: colors.radius, backgroundColor: colors.primary + "10", padding: 14, flexDirection: "row", gap: 10 }}>
            <Feather name="info" size={17} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Donations go to your registered shared charity treasury. Experiences.fun never holds funds or controls wallet keys.</Text>
          </View>
          {!treasuryQuery.data ? (
            <View style={{ gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 15 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Connect the charity treasury first</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Campaigns use the charity’s shared treasury. Register its public wallet address before launching this raise.</Text>
              {button("Set up treasury", () => { setStage("dashboard"); }, true, false, "arrow-left")}
            </View>
          ) : (
            <>
          {experienceIdToAttach ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: colors.radius - 4, backgroundColor: colors.primary + "10", padding: 12 }}>
              <Feather name="calendar" size={15} color={colors.primary} />
              <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>This fundraiser will be attached to {initialExperienceTitle || "your selected Experience"}.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove Experience from fundraiser" onPress={() => setExperienceIdToAttach(undefined)} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          {field("Fund name", title, setTitle, "e.g. Community garden supplies")}
          {field("Short description", description, setDescription, "Explain what donations will support and how they help.", true)}
          {field("Goal amount (SOL)", goalSol, setGoalSol, "e.g. 10")}
          {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, lineHeight: 18 }}>{error}</Text> : null}
          {button(create.isPending ? "Creating fund…" : "Create fund", () => {
            const goal = Number(goalSol);
            if (!title.trim() || title.trim().length < 3 || !description.trim() || description.trim().length < 10 || !Number.isFinite(goal) || goal <= 0 || Number(goal.toFixed(9)) !== goal) {
              setError("Add a fund name, a description of at least 10 characters, and a positive SOL goal (up to 9 decimal places).");
              return;
            }
            setError(null);
             void create.mutateAsync({ data: { title: title.trim(), description: description.trim(), goalSol: goal, ...(experienceIdToAttach ? { experienceId: experienceIdToAttach } : {}) } })
              .then((fund) => {
                setCreatedFund(fund);
                setSelectedFund(fund);
                setTitle("");
                setDescription("");
                setGoalSol("");
                setStage("success");
              })
              .catch((cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The fund could not be launched. Please try again."));
          }, false, create.isPending || !treasuryQuery.data, "arrow-right")}
            </>
          )}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "campaigns") {
    const campaigns = fundsQuery.data ?? [];
    const visibleCampaigns = campaigns.filter((fund) => campaignFilter === "all" || fund.status === campaignFilter);
    const activeCount = campaigns.filter((fund) => fund.status === "active").length;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Follow verified fundraiser progress.", onBack, "Back to treasury")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 34, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Campaigns</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{activeCount} active · {campaigns.length} total</Text>
            </View>
            {button("Launch a fund", () => { setError(null); setStage("create"); }, false, false, "plus")}
          </View>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {(["active", "all", "closed"] as const).map((filter) => (
              <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: campaignFilter === filter }} testID={`campaign-filter-${filter}`} onPress={() => setCampaignFilter(filter)} style={{ flex: 1, minHeight: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: campaignFilter === filter ? colors.primary : colors.card, borderWidth: 1, borderColor: campaignFilter === filter ? colors.primary : colors.border }}>
                <Text style={{ color: campaignFilter === filter ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{filter}</Text>
              </Pressable>
            ))}
          </View>
          {fundsQuery.isLoading ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 14 }}>Loading campaign progress…</Text> : fundsQuery.isError ? (
            <View style={{ gap: 9 }}>
              <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>Campaign progress could not be loaded.</Text>
              {button("Try again", () => { void fundsQuery.refetch(); }, true, fundsQuery.isFetching, "refresh-cw")}
            </View>
          ) : visibleCampaigns.length ? visibleCampaigns.map((fund) => (
            <CampaignProgressCard key={fund.id} fund={fund} onPress={() => { setSelectedFund(fund); setStage("detail"); }} />
          )) : (
            <View style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 18, gap: 8 }}>
              <Feather name="target" size={25} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>{campaignFilter === "active" ? "No active campaigns" : campaignFilter === "closed" ? "No closed campaigns" : "No campaigns yet"}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Launch a fundraiser when your organisation is ready to raise support.</Text>
              {campaignFilter !== "active" ? null : button("Launch a fund", () => { setError(null); setStage("create"); }, false, false, "plus")}
            </View>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Progress includes recorded, finalized campaign deposits only. Transfers to the shared treasury may not be attributable to a campaign.</Text>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "detail" && (selectedFund || selectedFundFromRoute)) {
    const activeSelectedFund = selectedFund ?? selectedFundFromRoute!;
    const fund = fundsQuery.data?.find((row) => row.id === activeSelectedFund.id) ?? activeSelectedFund;
    const launchedDate = transactionDateLabel(fund.createdAt);
    const sharedTreasury = treasuryQuery.data?.treasury.walletAddress === fund.walletAddress
      && treasuryQuery.data.treasury.cluster === fund.cluster
      ? treasuryQuery.data
      : undefined;
    const shareFund = () => Share.share({
      message: `${fund.title}\n\n${fund.description}\n\nCampaign goal: ${fund.goalSol.toLocaleString()} SOL\n\nContributions are sent to ${fund.organisationName}'s shared charity treasury. On-chain transfers may not be attributable to this specific fund.\n\nTreasury: ${fund.walletAddress}`,
    });
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Verified progress and campaign details", () => onOpenCampaign ? onOpenCampaign(fund.id) : setStage("campaigns"), "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={60}
        >
          <View style={{ borderRadius: colors.radius + 5, overflow: "hidden", backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "24", padding: 18, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fund.status.toLowerCase() === "active" ? colors.success : colors.mutedForeground }} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6 }}>{fund.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Campaign #{fund.id}</Text>
            </View>
            <View style={{ gap: 7 }}>
              <Text style={{ color: colors.foreground, fontSize: 25, lineHeight: 31, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Feather name="briefcase" size={14} color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{fund.organisationName}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: colors.card, paddingHorizontal: 9, paddingVertical: 7 }}>
                <Feather name="target" size={12} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Goal · {fund.goalSol.toLocaleString()} SOL</Text>
              </View>
              {launchedDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: colors.card, paddingHorizontal: 9, paddingVertical: 7 }}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Started {launchedDate}</Text>
                </View>
              ) : null}
            </View>
            {fund.experienceTitle ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 9 }}>
                <Feather name="calendar" size={13} color={colors.primary} />
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Supporting {fund.experienceTitle}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>What this supports</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>{fund.description}</Text>
          </View>

          <View style={{ borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.primary + "08", borderRadius: colors.radius + 3, padding: 15, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + "16", alignItems: "center", justifyContent: "center" }}>
                <Feather name="shield" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>One shared charity treasury</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Your transfer goes to the organisation, not a campaign-specific wallet.</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.primary + "20", paddingTop: 10, gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>TREASURY ADDRESS</Text>
              <Text selectable style={{ color: colors.foreground, fontSize: 11, lineHeight: 17, fontFamily: "Inter_600SemiBold" }}>{fund.walletAddress}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Solana · {fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}</Text>
              {sharedTreasury ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: 1, borderTopColor: colors.primary + "20", paddingTop: 9 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>SHARED TREASURY BALANCE</Text>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>{sharedTreasury.balanceSol} SOL</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Checked {transactionDateLabel(sharedTreasury.checkedAt) ?? "recently"}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={treasuryQuery.isFetching ? "Refreshing shared treasury balance" : "Refresh shared treasury balance"}
                    testID={`fund-detail-refresh-treasury-${fund.id}`}
                    disabled={treasuryQuery.isFetching}
                    onPress={() => { void treasuryQuery.refetch(); }}
                    style={{ minHeight: 40, minWidth: 40, alignItems: "center", justifyContent: "center", opacity: treasuryQuery.isFetching ? 0.55 : 1 }}
                  >
                    <Feather name="refresh-cw" size={15} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Raised totals count only verified payment requests and recorded deposits. Funds share one treasury, so other transfers may not be attributable to this fund.</Text>
          </View>

          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, padding: 15, gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Make a contribution</Text>
            <FundStats fund={fund} />
            <ContributeToFund fund={fund} />
          </View>
          <FundOwnerControls fund={fund} onUpdated={(updated) => {
            setSelectedFund(updated);
            queryClient.setQueryData<OrganisationFund[]>(getListOrganisationFundsQueryKey(organisationUserId), (current) =>
              current?.map((row) => row.id === updated.id ? updated : row));
          }} />

          <View style={{ flexDirection: "row", gap: 9 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open shared charity treasury on Solscan"
              testID={`fund-detail-solscan-${fund.id}`}
              onPress={() => {
                void Linking.openURL(solscanUrl(`account/${fund.walletAddress}`, fund.cluster)).catch(() => {
                  Alert.alert("Unable to open Solscan", "Check your connection and try again.");
                });
              }}
              style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: colors.radius - 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8 }}
            >
              <Feather name="external-link" size={15} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Solscan</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${fund.title}`}
              testID={`fund-detail-share-${fund.id}`}
              onPress={() => { void shareFund(); }}
              style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: colors.radius - 5, backgroundColor: colors.primary, paddingHorizontal: 8 }}
            >
              <Feather name="share-2" size={15} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Share fund</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header("Charity treasury", "Shared funds, campaign progress and community impact.", onBack, "Back to organisation profile")}
      <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 34, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
        {treasuryQuery.isLoading ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 16 }}>Loading charity treasury…</Text>
        ) : treasuryQuery.isError && (treasuryQuery.error as { status?: number })?.status !== 404 ? (
          <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 17 }}>
            <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19 }}>Your charity treasury could not be loaded. You can retry without changing your saved treasury.</Text>
            {button("Try again", () => { void treasuryQuery.refetch(); }, true, treasuryQuery.isFetching, "refresh-cw")}
          </View>
        ) : treasuryQuery.data ? (
          <>
            <View style={{ borderWidth: 1, borderColor: colors.primary + "35", borderRadius: colors.radius + 8, backgroundColor: colors.primary + "0A", padding: 18, gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="shield" size={14} color={colors.primary} />
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }}>SHARED TREASURY</Text>
                </View>
                <View style={{ borderRadius: 20, backgroundColor: colors.card, paddingHorizontal: 9, paddingVertical: 5 }}>
                  <Text style={{ color: colors.foreground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                    Solana · {treasuryQuery.data.treasury.cluster === "mainnet-beta" ? "Mainnet" : treasuryQuery.data.treasury.cluster}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 3 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Available balance</Text>
                <Text
                  accessibilityLabel={`Treasury balance ${treasuryQuery.data.balanceSol} SOL`}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={{ color: colors.foreground, fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -0.8 }}
                >
                  {treasuryQuery.data.balanceSol} <Text style={{ color: colors.primary, fontSize: 20 }}>SOL</Text>
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: colors.radius - 4, backgroundColor: colors.card, paddingHorizontal: 11, paddingVertical: 10 }}>
                <Feather name="key" size={14} color={colors.mutedForeground} />
                <Text
                  selectable
                  numberOfLines={1}
                  accessibilityLabel={`Treasury wallet address ${treasuryQuery.data.treasury.walletAddress}`}
                  style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}
                >
                  {shortAddress(treasuryQuery.data.treasury.walletAddress)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share treasury address"
                  onPress={() => { void Share.share({ message: `Send SOL to the charity treasury: ${treasuryQuery.data!.treasury.walletAddress}` }); }}
                  style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                  hitSlop={8}
                >
                  <Feather name="share" size={15} color={colors.primary} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 9 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {button("Solscan", () => { void Linking.openURL(solscanUrl(`account/${treasuryQuery.data!.treasury.walletAddress}`, treasuryQuery.data!.treasury.cluster)); }, true, false, "external-link")}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {button("Receive SOL", () => { void Share.share({ message: `Send SOL to the charity treasury: ${treasuryQuery.data!.treasury.walletAddress}` }); }, false, false, "share-2")}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={treasuryQuery.isFetching ? "Refreshing treasury" : "Refresh treasury balance and activity"}
                onPress={() => void treasuryQuery.refetch()}
                style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}
              >
                <Feather name="refresh-cw" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  {treasuryQuery.isFetching ? "Refreshing…" : "Refresh balance and activity"}
                </Text>
              </Pressable>
            </View>
            <View style={{ gap: 9 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Community impact</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                <ExpandableMetric label="CAMPAIGN RAISED" value={fundsQuery.data ? `${fundsQuery.data.reduce((total, fund) => total + Number(fund.raisedSol || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL` : "—"} detail="Total across campaign records with verified, finalized deposits. It is separate from the wallet balance and excludes unattributed transfers." icon="trending-up" expanded={expandedMetric === "raised"} onPress={() => setExpandedMetric(expandedMetric === "raised" ? null : "raised")} />
                <ExpandableMetric label="PARTICIPANT ENTRIES" value={hostOverviewQuery.data ? hostOverviewQuery.data.participantCount.toLocaleString() : "—"} detail="Participation records across your hosted Experiences. A person joining more than one Experience can appear more than once." icon="users" expanded={expandedMetric === "participants"} onPress={() => setExpandedMetric(expandedMetric === "participants" ? null : "participants")} />
                <ExpandableMetric label="EXPERIENCES" value={hostOverviewQuery.data ? hostOverviewQuery.data.totalExperiences.toLocaleString() : "—"} detail="Experiences hosted by your organisation. Fundraising is optional; these totals are not presented as funded Experiences." icon="calendar" expanded={expandedMetric === "experiences"} onPress={() => setExpandedMetric(expandedMetric === "experiences" ? null : "experiences")} />
                <ExpandableMetric label="REWARDED USERS" value={hostOverviewQuery.data ? hostOverviewQuery.data.rewardedUserCount.toLocaleString() : "—"} detail="Distinct recipients with a payout verified as paid on chain. Proposed or unverified payouts are not included." icon="award" expanded={expandedMetric === "rewarded"} onPress={() => setExpandedMetric(expandedMetric === "rewarded" ? null : "rewarded")} />
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Active campaigns</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Fundraising can support an Experience, but it is optional.</Text>
                </View>
                {fundsQuery.data?.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{fundsQuery.data.filter((fund) => fund.status === "active").length} active</Text> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>{button("Launch a fund", () => { setExperienceIdToAttach(undefined); setError(null); setStage("create"); }, false, false, "plus")}</View>
                <View style={{ flex: 1 }}>{button("Track campaigns", () => onOpenCampaign ? onOpenCampaign() : setStage("campaigns"), true, false, "bar-chart-2")}</View>
              </View>
              {fundsQuery.isLoading ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 10 }}>Loading your campaigns…</Text> :
                fundsQuery.isError ? (
                  <View style={{ gap: 8 }}>
                    <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>Your funds could not be loaded.</Text>
                    {button("Try again", () => { void fundsQuery.refetch(); }, true)}
                  </View>
                ) : fundsQuery.data?.some((fund) => fund.status === "active") ? fundsQuery.data.filter((fund) => fund.status === "active").map((fund) => (
                  <CampaignProgressCard key={fund.id} fund={fund} onPress={() => onOpenCampaign ? onOpenCampaign(fund.id) : (setSelectedFund(fund), setStage("detail"))} />
                )) : (
                  <View style={{ alignItems: "center", paddingVertical: 20, paddingHorizontal: 18, gap: 8 }}>
                    <Feather name="heart" size={25} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>No active funds yet</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Launch a campaign to invite your community to support your charity.</Text>
                  </View>
                )}
            </View>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Treasury activity</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Only confirmed incoming SOL is shown as a contribution</Text>
                </View>
                {allTransactions.length ? (
                  <View style={{ borderRadius: 20, backgroundColor: colors.muted, paddingHorizontal: 9, paddingVertical: 5 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{allTransactions.length} loaded</Text>
                  </View>
                ) : null}
              </View>
              {treasuryQuery.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>Treasury activity could not be refreshed. Check your connection and try again.</Text> : null}
              {visibleTransactions.map((transaction) => {
                const confirmed = transaction.status === "confirmed";
                const failed = transaction.status === "failed";
                const statusColor = confirmed ? colors.success : failed ? colors.destructive : colors.mutedForeground;
                const timestamp = transactionDateLabel(transaction.blockTime);
                const attributedFund = confirmed && transaction.campaignId
                  ? fundsQuery.data?.find((fund) => fund.id === transaction.campaignId)
                  : undefined;
                return (
                  <View key={transaction.signature} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 2, padding: 13, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: statusColor + "16", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={confirmed ? "arrow-down-left" : failed ? "x" : "clock"} size={17} color={statusColor} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                          {confirmed && transaction.amountSol ? `+${transaction.amountSol} SOL` : failed ? "Failed transaction" : "Details unavailable"}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          {timestamp ?? (transaction.sender ? `From ${shortAddress(transaction.sender)}` : "On-chain transaction")}
                        </Text>
                        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>
                          {confirmed && transaction.campaignId
                            ? `Campaign: ${attributedFund?.title ?? `#${transaction.campaignId}`}`
                            : confirmed ? "Unattributed or mixed-campaign transfers" : "Not verified as an incoming contribution"}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 18, backgroundColor: statusColor + "14", paddingHorizontal: 8, paddingVertical: 5 }}>
                        <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase" }}>{transaction.status}</Text>
                      </View>
                    </View>
                    {transaction.error ? (
                      <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>{transaction.error}</Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`View transaction ${shortAddress(transaction.signature)} on Solscan`}
                      onPress={() => { void Linking.openURL(solscanUrl(`tx/${transaction.signature}`, treasuryQuery.data!.treasury.cluster)); }}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }}
                    >
                      <Text selectable numberOfLines={1} style={{ flex: 1, color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                        {shortAddress(transaction.signature)}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>View</Text>
                        <Feather name="external-link" size={12} color={colors.primary} />
                      </View>
                    </Pressable>
                  </View>
                );
              })}
              {!treasuryQuery.data.transactions.length && !loadedTransactions.length && !treasuryQuery.isError
                ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No finalized treasury activity found yet.</Text>
                : null}
              {!activityExpanded && allTransactions.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setActivityExpanded(true)} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Show all loaded transfers</Text>
                  <Feather name="chevron-down" size={16} color={colors.primary} />
                </Pressable>
              ) : activityExpanded && allTransactions.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setActivityExpanded(false)} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Show recent only</Text>
                  <Feather name="chevron-up" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {activityExpanded && treasuryQuery.data.hasMore ? <Pressable accessibilityRole="button" disabled={treasuryQuery.isFetching} onPress={() => {
                if (!treasuryQuery.data?.nextCursor) return;
                setLoadedTransactions((previous) => [...previous, ...treasuryQuery.data!.transactions]);
                setBefore(treasuryQuery.data.nextCursor);
              }} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{treasuryQuery.isFetching ? "Loading…" : "Load older activity"}</Text></Pressable> : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>All fund donations go to this shared treasury. Experiences.fun only reads public on-chain activity and never controls the funds.</Text>
            </View>
          </>
        ) : (
          <View style={{ gap: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 17 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}><Feather name="shield" size={19} color={colors.primary} /></View>
            <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Connect your charity treasury</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Register your public Squads treasury address to receive donations and launch community funds. We verify the address is queryable, but cannot prove it belongs to Squads.</Text>
            {field("Treasury public address", treasuryAddress, setTreasuryAddress, "Paste your treasury address")}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Solana network</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["mainnet-beta", "devnet", "testnet"] as const).map((option) => (
                <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: cluster === option }} onPress={() => setCluster(option)} style={{ flex: 1, borderWidth: 1, borderColor: cluster === option ? colors.primary : colors.border, backgroundColor: cluster === option ? colors.primary : colors.card, borderRadius: colors.radius - 6, paddingVertical: 11, alignItems: "center" }}>
                  <Text style={{ color: cluster === option ? colors.primaryForeground : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{option === "mainnet-beta" ? "Mainnet" : option}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text> : null}
            {button(register.isPending ? "Checking address…" : "Register treasury", () => {
              setError(null);
              if (!isValidSolanaAddress(treasuryAddress.trim())) {
                setError("Enter a valid Solana public address.");
                return;
              }
              register.mutate({ data: { walletAddress: treasuryAddress.trim(), cluster } }, {
                onSuccess: () => {
                  setTreasuryAddress("");
                  setBefore(undefined);
                  setLoadedTransactions([]);
                  void queryClient.invalidateQueries({ queryKey: getGetOrganisationTreasuryQueryKey() });
                  void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
                  if (initialExperienceId) {
                    setStage("create");
                  }
                },
                onError: (cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The treasury could not be registered."),
              });
            }, false, register.isPending, "arrow-right")}
          </View>
        )}
        <CharityLedgerSection />
        <CharityPayoutsSection funds={fundsQuery.data ?? []} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
