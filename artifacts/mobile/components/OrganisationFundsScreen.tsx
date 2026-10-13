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

function FundCard({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const [amount, setAmount] = useState("");
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
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, overflow: "hidden" }}>
      <View style={{ height: 4, backgroundColor: colors.primary }} />
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}>
            <Feather name="heart" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ alignSelf: "flex-start", borderRadius: 20, backgroundColor: colors.primary + "14", paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.primary, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.7 }}>ACTIVE RAISE</Text>
            </View>
            <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 18, lineHeight: 23, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
          </View>
        </View>

        <Text numberOfLines={3} style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{fund.description}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: colors.radius - 4, backgroundColor: colors.muted, paddingHorizontal: 13, paddingVertical: 11 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.7 }}>FUND GOAL</Text>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Help make this work possible</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Feather name="target" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 19, fontFamily: "Inter_700Bold" }}>{fund.goalSol.toLocaleString()} SOL</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Feather name="shield" size={15} color={colors.mutedForeground} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Shared charity treasury</Text>
            <Text selectable numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>{fund.walletAddress}</Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Make a contribution</Text>
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
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius + 4, backgroundColor: colors.card, padding: 17, gap: 11 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }}>TREASURY BALANCE</Text>
                <Feather name="eye" size={16} color={colors.mutedForeground} />
              </View>
              <Text accessibilityLabel={`Treasury balance ${treasuryQuery.data.balanceSol} SOL`} style={{ color: colors.foreground, fontSize: 32, fontFamily: "Inter_700Bold" }}>{treasuryQuery.data.balanceSol} SOL</Text>
              <Text selectable numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11 }}>{treasuryQuery.data.treasury.walletAddress}</Text>
              <View style={{ flexDirection: "row", gap: 9 }}>
                {button("View on Solscan", () => { void Linking.openURL(`https://solscan.io/account/${treasuryQuery.data!.treasury.walletAddress}${treasuryQuery.data!.treasury.cluster === "mainnet-beta" ? "" : `?cluster=${treasuryQuery.data!.treasury.cluster}`}`); }, true, false, "external-link")}
                <View style={{ flex: 1 }}>{button("Receive SOL", () => { void Share.share({ message: `Send SOL to the charity treasury: ${treasuryQuery.data!.treasury.walletAddress}` }); }, false, false, "share-2")}</View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => void treasuryQuery.refetch()} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
                <Feather name="refresh-cw" size={13} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{treasuryQuery.isFetching ? "Refreshing…" : "Refresh balance and activity"}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 9 }}>
              {[
                { label: "ACTIVE FUNDS", value: fundsQuery.data?.length ?? 0, icon: "heart" as const },
                { label: "RECENT TRANSFERS", value: treasuryQuery.data.transactions.length, icon: "activity" as const },
              ].map((metric) => (
                <View key={metric.label} style={{ flex: 1, minHeight: 82, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 12, gap: 6 }}>
                  <Feather name={metric.icon} size={15} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>{metric.value}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.45 }}>{metric.label}</Text>
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
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Treasury activity</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Finalized on-chain transfers</Text>
              </View>
              {treasuryQuery.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>Treasury activity could not be refreshed. Check your connection and try again.</Text> : null}
              {[...loadedTransactions, ...treasuryQuery.data.transactions].map((transaction) => (
                <View key={transaction.signature} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius - 4, padding: 12, gap: 5 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: transaction.status === "confirmed" ? colors.foreground : colors.destructive, fontFamily: "Inter_700Bold", fontSize: 14 }}>
                      {transaction.amountSol ? `+${transaction.amountSol} SOL` : transaction.status === "failed" ? "Failed transaction" : "Transaction details unavailable"}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, textTransform: "uppercase" }}>{transaction.status}</Text>
                  </View>
                  <Text selectable style={{ color: colors.mutedForeground, fontSize: 11 }}>From {transaction.sender ?? "Unknown sender"}{transaction.blockTime ? ` · ${new Date(transaction.blockTime).toLocaleString()}` : ""}</Text>
                  <Text selectable numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>{transaction.signature}</Text>
                  {transaction.error ? <Text style={{ color: colors.destructive, fontSize: 11 }}>{transaction.error}</Text> : null}
                </View>
              ))}
              {!treasuryQuery.data.transactions.length && !loadedTransactions.length && !treasuryQuery.isError
                ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No finalized treasury activity found yet.</Text>
                : null}
              {treasuryQuery.data.hasMore ? <Pressable accessibilityRole="button" disabled={treasuryQuery.isFetching} onPress={() => {
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
