import { ReactNode, useState } from "react";
import { Image, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getListOrganisationFundsQueryKey,
  getListFundPayoutsQueryKey,
  useCancelFundPayout,
  useCreateFundPayout,
  useListCharityPayoutCandidates,
  useListOrganisationFunds,
  useListFundPayouts,
  useVerifyFundPayout,
} from "@workspace/api-client-react";
import type { FundPayout } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  Btn, Card, ErrorBlock, Field, Notice, NetworkBadge, SectionTitle, Skeleton, apiErrorMessage,
  dateLabel, explorerUrl, openExternal, refreshFundData, shareText,
} from "./shared";

const SQUADS_URL = "https://app.squads.so/";

function PayoutEmptyState() {
  const colors = useColors();
  return (
    <View
      testID="payout-empty-state"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: colors.radius + 4,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      <View style={{
        width: 78,
        height: 72,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: colors.radius + 2,
        backgroundColor: colors.secondary + "0D",
        borderWidth: 1,
        borderColor: colors.secondary + "18",
      }}>
        <Image
          testID="payout-empty-artwork"
          source={require("../../assets/images/category-community.png")}
          resizeMode="contain"
          accessible={false}
          style={{ width: 70, height: 70 }}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 13 }}>No payout proposals yet</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Recorded proposals will appear here with their verification status.
        </Text>
      </View>
    </View>
  );
}

export function usePayoutList(before?: string) {
  const { user } = useAuth();
  const params = before ? { before } : undefined;
  return useListFundPayouts(params, { query: { queryKey: [...getListFundPayoutsQueryKey(params), user?.id ?? "anon"], enabled: !!user, staleTime: 0 } });
}

function PayoutPage({ before, first, role, recipientId, empty, onMore }: { before?: string; first: boolean; role: "owner" | "recipient"; recipientId?: number; empty: ReactNode; onMore: (id: string) => void }) {
  const list = usePayoutList(before);
  if (list.isLoading) return <Skeleton />;
  if (list.isError) return <ErrorBlock message={apiErrorMessage(list.error, "Payouts could not be loaded.")} onRetry={() => { void list.refetch(); }} />;
  const rows = list.data ?? [];
  const shown = recipientId === undefined ? rows : rows.filter((p) => p.recipientUserId === recipientId);
  return (
    <View style={{ gap: 10 }}>
      {first && !shown.length && rows.length < 50 ? empty : null}
      {shown.map((p) => <PayoutCard key={p.id} payout={p} role={role} />)}
      {rows.length >= 50 ? <Btn label="Load older payouts" icon="chevron-down" variant="secondary" testID="payouts-load-older" onPress={() => onMore(rows[rows.length - 1].id)} /> : null}
    </View>
  );
}

export function PayoutPages({ role, recipientId, empty }: { role: "owner" | "recipient"; recipientId?: number; empty: ReactNode }) {
  const [pages, setPages] = useState<Array<string | undefined>>([undefined]);
  return (
    <View style={{ gap: 10 }}>
      {pages.map((c, i) => <PayoutPage key={c ?? "first"} before={c} first={i === 0} role={role} recipientId={recipientId} empty={empty} onMore={(id) => setPages((p) => (p.includes(id) ? p : [...p, id]))} />)}
    </View>
  );
}

function proposalText(p: FundPayout) {
  return `Volunteer payout proposal (not an approval, reservation or payment)\nMemo (exact): ${p.memo}\nFrom treasury: ${p.treasuryAddress}\nTo: ${p.walletAddress}\nAmount: ${p.amountSol} SOL\nNetwork: Solana ${p.cluster}\nReason: ${p.reason}`;
}

export function PayoutCard({ payout: p, role }: { payout: FundPayout; role: "owner" | "recipient" }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const verify = useVerifyFundPayout();
  const cancel = useCancelFundPayout();
  const statusColor = p.status === "paid" ? colors.success : p.status === "cancelled" ? colors.mutedForeground : colors.primary;
  const label = p.status === "paid" ? "PAID · VERIFIED ON CHAIN" : p.status === "cancelled" ? "DISMISSED" : "PROPOSED · UNPAID";

  const doVerify = () => {
    const sig = signature.trim();
    if (sig.length < 32) { setFeedback({ tone: "error", text: "Paste the executed transaction signature from your multisig tooling." }); return; }
    setFeedback(null);
    verify.mutate({ payoutId: p.id, data: { signature: sig } }, {
      onSuccess: (next) => {
        void refreshFundData(queryClient);
        setFeedback(next.status === "paid"
          ? { tone: "success", text: "Transfer verified on chain and recorded as paid." }
          : { tone: "info", text: next.verificationMessage ?? "Not verified yet. The transfer must be finalized and carry the exact memo." });
      },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "Verification failed. Check the signature, and that the transfer is finalized with the exact memo.") }),
    });
  };
  const doCancel = () => cancel.mutate({ payoutId: p.id }, {
    onSuccess: () => { void refreshFundData(queryClient); setFeedback({ tone: "info", text: "Proposal dismissed. This does not cancel anything in your multisig." }); },
    onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "Could not dismiss this proposal.") }),
  });

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>{p.amountSol} SOL</Text>
        <View style={{ borderRadius: 999, backgroundColor: statusColor + "18", paddingHorizontal: 9, paddingVertical: 4 }}>
          <Text style={{ color: statusColor, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>{label}</Text>
        </View>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{role === "owner" ? `To ${p.recipientName}` : `From ${p.organisationName}`} · {dateLabel(p.createdAt)}</Text>
      <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>{p.reason}</Text>
      <NetworkBadge cluster={p.cluster} />
      <Field label="Exact memo" value={p.memo} />
      <Field label="Treasury (sender)" value={p.treasuryAddress} />
      <Field label="Recipient wallet" value={p.walletAddress} />
      {p.paidAt ? <Field label="Paid" value={dateLabel(p.paidAt) ?? p.paidAt} mono={false} /> : null}
      {p.signature ? <Field label="Signature" value={p.signature} /> : null}
      {p.signature ? <Btn label="View on Solscan" icon="external-link" variant="secondary" onPress={() => openExternal(explorerUrl("tx", p.signature as string, p.cluster))} /> : null}
      {p.status === "proposed" ? (
        <>
          <Notice text="A proposal is not an approval, a reservation of funds or a payment. It is only marked paid after a matching finalized transfer is verified." />
          {role === "owner" ? (
            <>
              <Btn label="Share proposal details" icon="share-2" variant="secondary" testID={`payout-share-${p.id}`} onPress={() => shareText(proposalText(p), () => setFeedback({ tone: "error", text: "Sharing is unavailable. Select the details above." }))} />
              <Notice text="Your external multisig signers must create, approve and execute this transfer in their own tooling, using the exact memo above. Experiences.fun does not validate that a multisig is configured." />
              <Btn label="Open Squads (external site)" icon="external-link" variant="secondary" testID={`payout-squads-${p.id}`} onPress={() => openExternal(SQUADS_URL, () => setFeedback({ tone: "error", text: "Could not open app.squads.so." }))} />
            </>
          ) : null}
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Verify an executed transfer</Text>
          <TextInput
            accessibilityLabel="Executed transaction signature"
            testID={`payout-signature-${p.id}`}
            value={signature}
            onChangeText={(v) => { setSignature(v); setFeedback(null); }}
            placeholder="Executed transaction signature"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 5, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.background, fontSize: 12 }}
          />
          <Btn label="Verify signature" icon="check" busy={verify.isPending} testID={`payout-verify-${p.id}`} onPress={doVerify} />
          {role === "owner" ? <Btn label="Dismiss proposal" icon="x" variant="secondary" danger busy={cancel.isPending} testID={`payout-dismiss-${p.id}`} onPress={doCancel} /> : null}
        </>
      ) : null}
      {feedback ? <Notice {...feedback} testID={`payout-feedback-${p.id}`} /> : null}
    </Card>
  );
}

export function CharityPayoutsSection({
  onNewProposal,
}: {
  onNewProposal: () => void;
}) {
  return (
    <View style={{ gap: 10 }} testID="charity-payouts">
      <SectionTitle title="Volunteer payouts" hint="Record a proposal for your external multisig. Recording does not approve, reserve or send funds." />
      <Btn label="New payout proposal" icon="plus" variant="secondary" testID="payout-new" onPress={onNewProposal} />
      <PayoutPages role="owner" empty={<PayoutEmptyState />} />
    </View>
  );
}

export function PayoutProposalScreen({
  organisationUserId,
  onBack,
}: {
  organisationUserId: number;
  onBack: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const candidates = useListCharityPayoutCandidates();
  const create = useCreateFundPayout();
  const insets = useSafeAreaInsets();
  const [recipient, setRecipient] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [fundId, setFundId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FundPayout | null>(null);
  const fundsQuery = useListOrganisationFunds(organisationUserId, {
    query: {
      queryKey: getListOrganisationFundsQueryKey(organisationUserId),
      enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0,
    },
  });
  const allCandidates = candidates.data ?? [];
  const searchTerm = candidateSearch.trim().toLocaleLowerCase();
  const visibleCandidates = allCandidates
    .filter((candidate) => !searchTerm
      || `${candidate.name} ${candidate.username} ${candidate.id}`.toLocaleLowerCase().includes(searchTerm))
    .slice(0, 8);
  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top + 12;
  const bottomInset = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const inputStyle = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius - 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
    fontSize: 13,
  } as const;

  const submit = () => {
    const id = Number(recipient.trim());
    if (!Number.isSafeInteger(id) || id <= 0) { setError("Enter the participant's numeric profile id."); return; }
    if (wallet.trim().length < 32) { setError("Enter the participant's Solana wallet address."); return; }
    if (!/^\d+(?:\.\d{1,9})?$/.test(amount.trim()) || Number(amount) <= 0) { setError("Enter an exact SOL amount with up to 9 decimal places."); return; }
    if (reason.trim().length < 5 || reason.trim().length > 300) { setError("Add a reason of 5–300 characters."); return; }
    create.mutate({ data: { recipientUserId: id, walletAddress: wallet.trim(), amountSol: amount.trim(), reason: reason.trim(), ...(fundId ? { fundId } : {}) } }, {
      onSuccess: (p) => { setCreated(p); void refreshFundData(queryClient); },
      onError: (e) => setError(apiErrorMessage(e, "The proposal could not be recorded.")),
    });
  };

  const header = (title: string, subtitle: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: topInset, paddingBottom: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to payouts"
        testID="payout-proposal-back"
        onPress={onBack}
        style={{ width: 44, height: 44, justifyContent: "center" }}
      >
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 21, fontFamily: "Inter_700Bold" }}>{title}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{subtitle}</Text>
      </View>
    </View>
  );

  if (created) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }} testID="payout-proposal-success-screen">
        {header("Proposal recorded", "Ready to share with your multisig signers")}
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 18, paddingBottom: bottomInset + 24, gap: 15 }}>
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
            <View style={{ width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.success + "16" }}>
              <Feather name="check-circle" size={28} color={colors.success} />
            </View>
            <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Proposal recorded</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>
              No funds have been approved, reserved or sent.
            </Text>
          </View>
          <Card tone="primary">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>{created.amountSol} SOL</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>To {created.recipientName}</Text>
            </View>
            <Field label="Reason" value={created.reason} mono={false} />
            <Field label="Exact memo for the transfer" value={created.memo} />
            {created.fundId ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Linked to the selected campaign.</Text> : null}
          </Card>
          <Notice text="Share the exact memo with your external multisig signers. They must approve and execute the transfer in their own wallet tooling." />
          <Btn
            label="Share proposal details"
            icon="share-2"
            variant="secondary"
            testID="payout-proposal-share"
            onPress={() => shareText(proposalText(created), () => setError("Sharing is unavailable. You can select and copy the memo above."))}
          />
          {error ? <Notice tone="error" text={error} /> : null}
          <Btn label="Back to payouts" icon="arrow-left" testID="payout-proposal-done" onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="payout-proposal-screen">
      {header("New payout proposal", "Record a request for your external multisig")}
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: bottomInset + 36, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={70}
      >
        <Card tone="primary">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Feather name="shield" size={16} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 19, fontFamily: "Inter_600SemiBold" }}>
              This records a proposal only. It does not approve, reserve or send funds.
            </Text>
          </View>
        </Card>

        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>RECIPIENT</Text>
          <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>Who is receiving this payout?</Text>
        </View>
        <Card>
          <Notice text="Confirm the wallet address with the volunteer. Selecting a profile does not prove they control that wallet." />
          {candidates.isLoading ? <Skeleton height={48} /> : candidates.isError ? (
            <Notice tone="error" text={apiErrorMessage(candidates.error, "Volunteer suggestions could not be loaded. Enter a profile id instead.")} />
          ) : allCandidates.length ? (
            <>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Find a participant</Text>
              <TextInput
                accessibilityLabel="Find a participant"
                testID="payout-candidate-search"
                value={candidateSearch}
                onChangeText={setCandidateSearch}
                placeholder="Search name, username or profile id"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle}
              />
              {visibleCandidates.length ? (
                <View style={{ gap: 7 }}>
                  {visibleCandidates.map((candidate) => {
                    const selected = recipient === String(candidate.id);
                    return (
                      <Pressable
                        key={candidate.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${candidate.name}, @${candidate.username}, profile ${candidate.id}`}
                        accessibilityState={{ selected }}
                        testID={`payout-candidate-${candidate.id}`}
                        onPress={() => {
                          const nextRecipient = String(candidate.id);
                          if (recipient !== nextRecipient) setWallet("");
                          setRecipient(nextRecipient);
                          setError(null);
                        }}
                        style={{
                          minHeight: 46,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 9,
                          borderWidth: 1,
                          borderColor: selected ? colors.primary : colors.border,
                          borderRadius: colors.radius - 5,
                          backgroundColor: selected ? colors.primary + "0D" : colors.background,
                          paddingHorizontal: 11,
                        }}
                      >
                        <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.primary + "1B" : colors.muted }}>
                          <Feather name={selected ? "check" : "user"} size={14} color={selected ? colors.primary : colors.mutedForeground} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{candidate.name}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>@{candidate.username} · ID {candidate.id}</Text>
                        </View>
                        {selected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                  {allCandidates.length > visibleCandidates.length && !searchTerm ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Search to find another participant, or enter their profile id below.</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>No matches. Enter a participant profile id below.</Text>
              )}
            </>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>No volunteers found yet. Enter a participant profile id below.</Text>
          )}
          <View style={{ gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Participant profile ID</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Used to keep payout history connected to the right profile.</Text>
            <TextInput
              accessibilityLabel="Participant profile ID"
              testID="payout-recipient-id"
              value={recipient}
              onChangeText={(value) => {
                if (value !== recipient) setWallet("");
                setRecipient(value);
                setError(null);
              }}
              placeholder="e.g. 42"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={inputStyle}
            />
          </View>
          <View style={{ gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Recipient wallet address</Text>
            <TextInput
              accessibilityLabel="Recipient wallet address"
              testID="payout-recipient-wallet"
              value={wallet}
              onChangeText={(value) => { setWallet(value); setError(null); }}
              placeholder="Paste the confirmed Solana address"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>
        </Card>

        <View style={{ gap: 6, marginTop: 2 }}>
          <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>PAYOUT DETAILS</Text>
          <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>How much, and why?</Text>
        </View>
        <Card>
          <View style={{ gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Amount</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TextInput
                accessibilityLabel="Amount in SOL"
                testID="payout-amount"
                value={amount}
                onChangeText={(value) => { setAmount(value); setError(null); }}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[inputStyle, { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" }]}
              />
              <View style={{ minHeight: 48, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 5, backgroundColor: colors.muted, paddingHorizontal: 14 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>SOL</Text>
              </View>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Enter the exact amount, up to 9 decimal places.</Text>
          </View>
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reason</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{reason.trim().length}/300</Text>
            </View>
            <TextInput
              accessibilityLabel="Reason for payout"
              testID="payout-reason"
              value={reason}
              onChangeText={(value) => { setReason(value); setError(null); }}
              placeholder="What the volunteer is being paid for"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="sentences"
              maxLength={300}
              multiline
              textAlignVertical="top"
              style={[inputStyle, { minHeight: 100, paddingTop: 12 }]}
            />
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Add a clear reason so your signers can review the request.</Text>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Campaign</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Optional · link this payout to a campaign.</Text>
            </View>
            {fundsQuery.isLoading ? <Skeleton height={44} /> : fundsQuery.isError ? (
              <Notice tone="error" text={apiErrorMessage(fundsQuery.error, "Campaigns could not be loaded. You can continue without linking one.")} />
            ) : (
              <View style={{ gap: 7 }}>
                {[{ id: undefined as number | undefined, title: "No campaign" }, ...(fundsQuery.data ?? []).map((fund) => ({ id: fund.id as number | undefined, title: fund.title }))].map((fund) => {
                  const selected = fundId === fund.id;
                  return (
                    <Pressable
                      key={fund.id ?? "none"}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={`payout-fund-${fund.id ?? "none"}`}
                      onPress={() => { setFundId(fund.id); setError(null); }}
                      style={{
                        minHeight: 44,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: colors.radius - 5,
                        backgroundColor: selected ? colors.primary + "0D" : colors.background,
                        paddingHorizontal: 11,
                      }}
                    >
                      <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular" }}>{fund.title}</Text>
                      {selected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </Card>
        {error ? <Notice tone="error" text={error} /> : null}
        <Btn label="Record proposal" icon="file-text" busy={create.isPending} testID="payout-create" onPress={submit} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
