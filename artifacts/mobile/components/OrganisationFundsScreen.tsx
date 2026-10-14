import { useState } from "react";
import { Alert, Linking, Pressable, Share, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOrganisationTreasuryQueryKey,
  getListOrganisationFundsQueryKey,
  useCreateOrganisationFund,
  useGetOrganisationTreasury,
  useListOrganisationFunds,
  useRegisterOrganisationTreasury,
} from "@workspace/api-client-react";
import type { OrganisationFund, OrganisationTreasuryDashboard, OrganisationTreasuryInput } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { buildDonationUri, isValidSolanaAddress } from "@/lib/solana-pay.mjs";

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

function FundCard({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const [amount, setAmount] = useState("");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const launchedDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(fund.createdAt));
  const donate = async () => {
    const parsed = Number(amount);
    let uri: string;
    try {
      uri = buildDonationUri({
        recipient: fund.walletAddress,
        amount: parsed,
        organisationName: fund.organisationName,
        fundTitle: fund.title,
        fundId: fund.id,
        cluster: fund.cluster,
      });
    } catch (cause) {
      Alert.alert(
        "Unable to prepare donation",
        cause instanceof Error ? cause.message : "Check the amount and charity treasury address.",
      );
      return;
    }
    const transferAmount = parsed.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
    try {
      await Linking.openURL(uri);
    } catch {
      await Share.share({ message: `Send ${transferAmount} SOL to ${fund.walletAddress} for “${fund.title}”.` });
    }
  };
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 6, overflow: "hidden" }}>
      <View style={{ padding: 18, gap: 16 }}>
        <View style={{ gap: 10 }}>
          <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, backgroundColor: `${colors.primary}18`, paddingHorizontal: 10, paddingVertical: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }} />
            <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>ACTIVE FUNDRAISER</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 23, lineHeight: 29, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
            <Feather name="briefcase" size={13} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{fund.organisationName}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>·</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Launched {launchedDate}</Text>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text numberOfLines={descriptionExpanded ? undefined : 3} style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{fund.description}</Text>
          {fund.description.length > 150 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={descriptionExpanded ? "Show less campaign information" : "Read full campaign information"}
              testID={`fund-description-toggle-${fund.id}`}
              onPress={() => setDescriptionExpanded((expanded) => !expanded)}
              style={{ alignSelf: "flex-start", paddingVertical: 3 }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{descriptionExpanded ? "Show less" : "Read more"}</Text>
            </Pressable>
          ) : null}
        </View>

        <View
          testID={`fund-progress-${fund.id}`}
          accessible
          accessibilityLabel={`Fundraising progress unavailable. Goal: ${fund.goalSol.toLocaleString()} SOL. Donations go directly to the shared treasury.`}
          style={{ gap: 12, borderRadius: colors.radius + 2, backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28`, borderWidth: 1, padding: 16 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}20` }}>
              <Feather name="target" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }}>FUND GOAL</Text>
              <Text style={{ color: colors.foreground, fontSize: 27, lineHeight: 32, fontFamily: "Inter_700Bold" }}>{fund.goalSol.toLocaleString()} SOL</Text>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: `${colors.primary}24` }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>RAISED SO FAR</Text>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Not tracked</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Feather name="info" size={13} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>Progress unavailable</Text>
            </View>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            Contributions go directly to the shared treasury. Verified fundraising totals aren’t available here yet.
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}14` }}>
            <Feather name="shield" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Shared charity treasury</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Solana · {fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}</Text>
            <Text selectable numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>{fund.walletAddress}</Text>
          </View>
        </View>

        <View style={{ gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius + 2, padding: 14 }}>
          <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>Make a contribution</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 4, padding: 5, minHeight: 54 }}>
            <TextInput
              accessibilityLabel={`Donation amount in SOL for ${fund.title}`}
              testID={`donation-amount-${fund.id}`}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount in SOL"
              placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, minWidth: 0, paddingHorizontal: 9, color: colors.foreground, fontSize: 14 }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={`Donate to ${fund.title}`} testID={`donate-${fund.id}`} onPress={() => void donate()} style={{ minHeight: 42, backgroundColor: colors.primary, borderRadius: colors.radius - 7, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 13 }}>Donate</Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>Your wallet will ask you to approve the transfer. Transfers cannot be reversed.</Text>
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
  if (query.isLoading) return <Text style={{ color: colors.mutedForeground, marginVertical: 12 }}>Loading active funds…</Text>;
  if (query.isError) return <Text style={{ color: colors.mutedForeground, marginVertical: 12 }}>Funds could not be loaded.</Text>;
  if (!query.data?.length && !canLaunch) return null;
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Support our work</Text>
        {canLaunch ? <Pressable accessibilityRole="button" onPress={onLaunch} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Feather name="plus" size={15} color={colors.primary} /><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 13 }}>Launch a fund</Text></Pressable> : null}
      </View>
      {query.data?.map((fund) => <FundCard key={fund.id} fund={fund} />)}
      {!query.data?.length && canLaunch ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No active funds yet. Set up the charity treasury to invite SOL donations.</Text> : null}
    </View>
  );
}

export function OrganisationFundsScreen({ organisationUserId, onBack }: { organisationUserId: number; onBack: () => void }) {
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
  const [stage, setStage] = useState<"dashboard" | "create" | "success" | "detail">("dashboard");
  const [createdFund, setCreatedFund] = useState<OrganisationFund | null>(null);
  const [selectedFund, setSelectedFund] = useState<OrganisationFund | null>(null);
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

  if (stage === "success" && createdFund) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Fund created", "Your campaign is live and ready to share.", () => setStage("dashboard"), "Back to funds dashboard")}
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
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{createdFund.description}</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Goal · {createdFund.goalSol.toLocaleString()} SOL</Text>
          </View>
          {button("View fund", () => { setSelectedFund(createdFund); setStage("detail"); }, false, false, "arrow-right")}
          {button("Share fund", () => {
            void Share.share({ message: `${createdFund.title}\n\n${createdFund.description}\n\nGoal: ${createdFund.goalSol.toLocaleString()} SOL\nDonate to the charity treasury: ${createdFund.walletAddress}` });
          }, true, false, "share-2")}
          {button("Back to funds dashboard", () => setStage("dashboard"), true)}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "create") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Launch a fund", "Create a new campaign for your community.", () => { setError(null); setStage("dashboard"); }, "Back to funds dashboard")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 34, gap: 17 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
          <View style={{ borderRadius: colors.radius, backgroundColor: colors.primary + "10", padding: 14, flexDirection: "row", gap: 10 }}>
            <Feather name="info" size={17} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Donations go to your registered shared charity treasury. Experiences.fun never holds funds or controls wallet keys.</Text>
          </View>
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
            void create.mutateAsync({ data: { title: title.trim(), description: description.trim(), goalSol: goal } })
              .then((fund) => {
                setCreatedFund(fund);
                setSelectedFund(fund);
                setTitle("");
                setDescription("");
                setGoalSol("");
                setStage("success");
              })
              .catch((cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The fund could not be launched. Please try again."));
          }, false, create.isPending, "arrow-right")}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "detail" && selectedFund) {
    const solscanUrl = `https://solscan.io/account/${selectedFund.walletAddress}${selectedFund.cluster === "mainnet-beta" ? "" : `?cluster=${selectedFund.cluster}`}`;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Fund details", "Campaign overview", () => setStage("dashboard"), "Back to funds dashboard")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 34, gap: 14 }}>
          <View style={{ borderRadius: colors.radius, overflow: "hidden", backgroundColor: colors.primary + "14", minHeight: 132, padding: 18, justifyContent: "flex-end" }}>
            <Feather name="heart" size={32} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 23, lineHeight: 28, fontFamily: "Inter_700Bold", marginTop: 12 }}>{selectedFund.title}</Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, gap: 12 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.7 }}>CAMPAIGN GOAL</Text>
            <Text style={{ color: colors.foreground, fontSize: 26, fontFamily: "Inter_700Bold" }}>{selectedFund.goalSol.toLocaleString()} SOL</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Donations are sent to the charity’s shared treasury. Per-campaign totals are not currently available.</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>About this fund</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>{selectedFund.description}</Text>
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, gap: 8 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold" }}>Charity treasury</Text>
            <Text selectable style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{selectedFund.walletAddress}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Solana {selectedFund.cluster === "mainnet-beta" ? "Mainnet" : selectedFund.cluster}</Text>
          </View>
          {button("View treasury on Solscan", () => { void Linking.openURL(solscanUrl); }, true, false, "external-link")}
          {button("Share this fund", () => {
            void Share.share({ message: `${selectedFund.title}\n\n${selectedFund.description}\n\nGoal: ${selectedFund.goalSol.toLocaleString()} SOL\nDonate to the charity treasury: ${selectedFund.walletAddress}` });
          }, false, false, "share-2")}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header("Organisation funds", "Manage your charity treasury and campaigns.", onBack, "Back to organisation profile")}
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
            <View style={{ flexDirection: "row", gap: 9 }}>
              {[
                { label: "ACTIVE FUNDS", value: fundsQuery.data?.length ?? 0, icon: "heart" as const },
                { label: "RECENT TRANSFERS", value: treasuryQuery.data.transactions.length, icon: "activity" as const },
              ].map((metric) => (
                <View key={metric.label} style={{ flex: 1, minHeight: 74, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 2, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={metric.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={{ gap: 3 }}>
                    <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>{metric.value}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>{metric.label}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Your funds</Text>
                {fundsQuery.data?.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{fundsQuery.data.length} active</Text> : null}
              </View>
              {button("Launch a fund", () => { setError(null); setStage("create"); }, false, false, "plus")}
              {fundsQuery.isLoading ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 10 }}>Loading your campaigns…</Text> :
                fundsQuery.isError ? (
                  <View style={{ gap: 8 }}>
                    <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>Your funds could not be loaded.</Text>
                    {button("Try again", () => { void fundsQuery.refetch(); }, true)}
                  </View>
                ) : fundsQuery.data?.length ? fundsQuery.data.map((fund) => (
                  <Pressable
                    key={fund.id}
                    accessibilityRole="button"
                    accessibilityLabel={`View fund ${fund.title}`}
                    onPress={() => { setSelectedFund(fund); setStage("detail"); }}
                    style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 14, gap: 9 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 33, height: 33, borderRadius: 11, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}><Feather name="heart" size={16} color={colors.primary} /></View>
                      <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </View>
                    <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>{fund.description}</Text>
                    <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Goal · {fund.goalSol.toLocaleString()} SOL</Text>
                  </Pressable>
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
                  <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Recent activity</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Finalized transfers to this treasury</Text>
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
                return (
                  <View key={transaction.signature} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 2, padding: 13, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: statusColor + "16", alignItems: "center", justifyContent: "center" }}>
                        <Feather name={confirmed ? "arrow-down-left" : failed ? "x" : "clock"} size={17} color={statusColor} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                          {confirmed && transaction.amountSol ? `+${transaction.amountSol} SOL` : failed ? "Failed transfer" : "Details unavailable"}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          {timestamp ?? (transaction.sender ? `From ${shortAddress(transaction.sender)}` : "On-chain transaction")}
                        </Text>
                      </View>
                      <View style={{ borderRadius: 18, backgroundColor: statusColor + "14", paddingHorizontal: 8, paddingVertical: 5 }}>
                        <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase" }}>{transaction.status}</Text>
                      </View>
                    </View>
                    {transaction.error && !confirmed && !failed ? null : transaction.error ? (
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
                },
                onError: (cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The treasury could not be registered."),
              });
            }, false, register.isPending, "arrow-right")}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
