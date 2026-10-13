import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListOrganisationFundsQueryKey,
  useCreateOrganisationFund,
  useListOrganisationFunds,
} from "@workspace/api-client-react";
import type { OrganisationFund } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

function FundCard({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const [amount, setAmount] = useState("");
  const donate = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000 || Number(parsed.toFixed(9)) !== parsed) {
      Alert.alert("Enter a valid amount", "Choose a positive SOL amount with up to 9 decimal places.");
      return;
    }
    const transferAmount = parsed.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
    const params = new URLSearchParams({
      amount: transferAmount,
      label: fund.organisationName,
      message: fund.title,
      memo: `Experiences.fun fund ${fund.id}`,
    });
    const uri = `solana:${fund.walletAddress}?${params.toString()}`;
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
      <Text selectable style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Direct to charity wallet · {fund.walletAddress}</Text>
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
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>Your wallet will show the recipient and ask you to approve. Transfers cannot be reversed; fund totals are not tracked in-app.</Text>
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
      {!query.data?.length && canLaunch ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No active funds yet. Launch one to invite direct SOL donations.</Text> : null}
    </View>
  );
}

export function OrganisationFundsScreen({ organisationUserId, onBack }: { organisationUserId: number; onBack: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [goalSol, setGoalSol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateOrganisationFund({ mutation: { onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
    setTitle(""); setDescription(""); setWalletAddress(""); setGoalSol(""); setError(null);
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
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Create a direct-to-wallet SOL fundraiser.</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Donations go directly to the wallet address you provide. Experiences.fun never holds funds or controls private keys. SOL transfers are irreversible, and campaign totals are not tracked.</Text>
        {field("Fund name", title, setTitle, "e.g. Community garden supplies")}
        {field("What will this fund support?", description, setDescription, "Explain how donations will help.", true)}
        {field("Charity’s Solana wallet address", walletAddress, setWalletAddress, "Public address only")}
        {field("Goal (SOL)", goalSol, setGoalSol, "e.g. 25")}
        {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={create.isPending} onPress={() => {
          const goal = Number(goalSol);
          if (!title.trim() || !description.trim() || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress.trim()) || !Number.isFinite(goal) || goal <= 0 || Number(goal.toFixed(9)) !== goal) {
            setError("Check the fund name, description, Solana wallet address, and goal (up to 9 decimal places).");
            return;
          }
          create.mutate({ data: { title: title.trim(), description: description.trim(), walletAddress: walletAddress.trim(), goalSol: goal } }, { onError: (cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The fund could not be launched. Please try again.") });
        }} style={{ backgroundColor: colors.primary, opacity: create.isPending ? 0.6 : 1, padding: 15, borderRadius: colors.radius, alignItems: "center" }}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold" }}>{create.isPending ? "Launching…" : "Launch fund"}</Text>
        </Pressable>
        <OrganisationFundraiserSection organisationUserId={organisationUserId} />
      </ScrollView>
    </View>
  );
}
