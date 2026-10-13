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
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="heart" size={16} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 }}>{fund.title}</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>{fund.description}</Text>
      <Text style={{ color: colors.primary, fontSize: 13, fontFamily: "Inter_700Bold" }}>Goal: {fund.goalSol.toLocaleString()} SOL</Text>
      <Text selectable style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Charity DAO treasury · {fund.walletAddress}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          accessibilityLabel={`Donation amount in SOL for ${fund.title}`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount in SOL"
          placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 12, color: colors.foreground }}
        />
        <Pressable accessibilityRole="button" onPress={() => void donate()} style={{ backgroundColor: colors.primary, borderRadius: colors.radius - 6, paddingHorizontal: 15, justifyContent: "center" }}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>Donate</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>Your wallet will show the charity treasury and ask you to approve. Transfers cannot be reversed.</Text>
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
  const treasuryQuery = useGetOrganisationTreasury({ limit: 20, before }, {
    query: {
      queryKey: getGetOrganisationTreasuryQueryKey({ limit: 20, before }),
      staleTime: 15_000,
      retry: false,
    },
  });
  const register = useRegisterOrganisationTreasury();
  const create = useCreateOrganisationFund({ mutation: { onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
    setTitle(""); setDescription(""); setGoalSol(""); setError(null);
  } } });
  const field = (label: string, value: string, setValue: (next: string) => void, placeholder: string, multiline = false) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{label}</Text>
      <TextInput value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} style={{ minHeight: multiline ? 88 : 48, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 12, paddingVertical: 11, color: colors.foreground, textAlignVertical: multiline ? "top" : "center" }} />
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to organisation profile" onPress={onBack} style={{ padding: 8 }}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold" }}>Organisation funds</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Manage the charity treasury and SOL funds.</Text>
        </View>
      </View>
      <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Register the public address of your charity’s Squads treasury. Experiences.fun only reads on-chain data; it never holds funds or controls keys. Confirm the address carefully before saving.</Text>
        {!treasuryQuery.data ? (
          <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16 }}>
            <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>Connect charity treasury</Text>
            {field("Treasury public address", treasuryAddress, setTreasuryAddress, "Paste your Squads vault address")}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Solana network</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["mainnet-beta", "devnet", "testnet"] as const).map((option) => (
                <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: cluster === option }} onPress={() => setCluster(option)} style={{ flex: 1, borderWidth: 1, borderColor: cluster === option ? colors.primary : colors.border, backgroundColor: cluster === option ? colors.primary : colors.card, borderRadius: colors.radius - 6, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ color: cluster === option ? colors.primaryForeground : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{option === "mainnet-beta" ? "Mainnet" : option}</Text>
                </Pressable>
              ))}
            </View>
            {treasuryQuery.isError && (treasuryQuery.error as { status?: number })?.status !== 404
              ? <Text style={{ color: colors.destructive, fontSize: 12 }}>Treasury status could not be loaded. You can still register an address, but the dashboard needs the API and database available.</Text>
              : null}
            <Pressable accessibilityRole="button" disabled={register.isPending} onPress={() => {
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
            }} style={{ backgroundColor: colors.primary, opacity: register.isPending ? 0.6 : 1, padding: 14, borderRadius: colors.radius, alignItems: "center" }}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{register.isPending ? "Checking address…" : "Register treasury"}</Text>
            </Pressable>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>The app checks that the address can be queried on the selected network, but cannot independently prove it belongs to Squads. Pending transfers appear after finalization.</Text>
          </View>
        ) : (
          <>
            <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>VERIFIED ON-CHAIN BALANCE</Text>
              <Text accessibilityLabel={`Treasury balance ${treasuryQuery.data.balanceSol} SOL`} style={{ color: colors.foreground, fontSize: 30, fontFamily: "Inter_700Bold" }}>{treasuryQuery.data.balanceSol} SOL</Text>
              <Text selectable style={{ color: colors.mutedForeground, fontSize: 11 }}>{treasuryQuery.data.treasury.walletAddress} · {treasuryQuery.data.treasury.cluster}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Checked {new Date(treasuryQuery.data.checkedAt).toLocaleString()}</Text>
              <Pressable accessibilityRole="button" onPress={() => void treasuryQuery.refetch()} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 }}>
                <Feather name="refresh-cw" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Refresh balance and activity</Text>
              </Pressable>
            </View>
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Treasury activity</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Finalized incoming SOL transfers are shown here, regardless of sender. Failed transactions are separated; pending transactions do not appear until finalized.</Text>
              {treasuryQuery.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>On-chain activity could not be refreshed. Check your connection and try again.</Text> : null}
              {[...loadedTransactions, ...(treasuryQuery.data?.transactions ?? [])].map((transaction) => (
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
              {treasuryQuery.data && !treasuryQuery.data.transactions.length && !loadedTransactions.length
                ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No finalized treasury activity found yet.</Text>
                : null}
              {treasuryQuery.data?.hasMore ? <Pressable accessibilityRole="button" disabled={treasuryQuery.isFetching} onPress={() => {
                if (!treasuryQuery.data?.nextCursor) return;
                setLoadedTransactions((previous) => [...previous, ...treasuryQuery.data!.transactions]);
                setBefore(treasuryQuery.data.nextCursor);
              }} style={{ paddingVertical: 12, alignItems: "center" }}><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{treasuryQuery.isFetching ? "Loading…" : "Load older activity"}</Text></Pressable> : null}
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>This charity treasury is locked after registration so earlier activity cannot be hidden by changing addresses.</Text>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
            <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Launch a fund</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Every campaign receives donations at this shared treasury address.</Text>
            {field("Fund name", title, setTitle, "e.g. Community garden supplies")}
            {field("What will this fund support?", description, setDescription, "Explain how donations will help.", true)}
            {field("Goal (SOL)", goalSol, setGoalSol, "e.g. 25")}
            <Pressable accessibilityRole="button" disabled={create.isPending} onPress={() => {
              const goal = Number(goalSol);
              if (!title.trim() || !description.trim() || !Number.isFinite(goal) || goal <= 0 || Number(goal.toFixed(9)) !== goal) {
                setError("Check the fund name, description, and goal (up to 9 decimal places).");
                return;
              }
              create.mutate({ data: { title: title.trim(), description: description.trim(), goalSol: goal } }, { onError: (cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The fund could not be launched. Please try again.") });
            }} style={{ backgroundColor: colors.primary, opacity: create.isPending ? 0.6 : 1, padding: 15, borderRadius: colors.radius, alignItems: "center" }}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{create.isPending ? "Launching…" : "Launch fund"}</Text>
            </Pressable>
          </>
        )}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
        {treasuryQuery.data ? <OrganisationFundraiserSection organisationUserId={organisationUserId} /> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
