import { ReactNode, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListFundPayoutsQueryKey,
  useCancelFundPayout,
  useCreateFundPayout,
  useListCharityPayoutCandidates,
  useListFundPayouts,
  useVerifyFundPayout,
} from "@workspace/api-client-react";
import type { FundPayout, OrganisationFund } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  Btn, Card, EmptyBlock, ErrorBlock, Field, Notice, NetworkBadge, SectionTitle, Skeleton, apiErrorMessage,
  dateLabel, explorerUrl, openExternal, refreshFundData, shareText,
} from "./shared";

const SQUADS_URL = "https://app.squads.so/";

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

export function CharityPayoutsSection({ funds }: { funds: OrganisationFund[] }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const candidates = useListCharityPayoutCandidates();
  const create = useCreateFundPayout();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [fundId, setFundId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FundPayout | null>(null);

  const input = (label: string, value: string, set: (v: string) => void, placeholder: string, extra?: object) => (
    <View style={{ gap: 5 }}>
      <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={(v) => { set(v); setError(null); }} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 5, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, backgroundColor: colors.background, fontSize: 13 }} {...extra} />
    </View>
  );

  const submit = () => {
    const id = Number(recipient.trim());
    if (!Number.isSafeInteger(id) || id <= 0) { setError("Enter the participant's numeric profile id."); return; }
    if (wallet.trim().length < 32) { setError("Enter the participant's Solana wallet address."); return; }
    if (!/^\d+(?:\.\d{1,9})?$/.test(amount.trim()) || Number(amount) <= 0) { setError("Enter an exact SOL amount with up to 9 decimal places."); return; }
    if (reason.trim().length < 5 || reason.trim().length > 300) { setError("Add a reason of 5–300 characters."); return; }
    create.mutate({ data: { recipientUserId: id, walletAddress: wallet.trim(), amountSol: amount.trim(), reason: reason.trim(), ...(fundId ? { fundId } : {}) } }, {
      onSuccess: (p) => { setCreated(p); setOpen(false); setRecipient(""); setWallet(""); setAmount(""); setReason(""); setFundId(undefined); void refreshFundData(queryClient); },
      onError: (e) => setError(apiErrorMessage(e, "The proposal could not be recorded.")),
    });
  };

  return (
    <View style={{ gap: 10 }} testID="charity-payouts">
      <SectionTitle title="Volunteer payouts" hint="Record a proposal for your external multisig. Recording does not approve, reserve or send funds." />
      {created ? <Notice tone="success" text={`Proposal recorded. Memo: ${created.memo}. Share the details with your signers below.`} /> : null}
      {open ? (
        <Card>
          <Notice text="Confirm the wallet address with the volunteer before proposing a payout. A profile selection does not prove they control that wallet." />
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Suggested volunteers</Text>
          {candidates.isLoading ? <Skeleton height={48} /> : candidates.isError ? (
            <Notice tone="error" text={apiErrorMessage(candidates.error, "Volunteer suggestions could not be loaded. Enter a profile id instead.")} />
          ) : candidates.data?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {candidates.data.map((c) => (
                <Btn key={c.id} label={`${c.name} @${c.username}`} variant={recipient === String(c.id) ? "primary" : "secondary"} testID={`payout-candidate-${c.id}`} onPress={() => { setRecipient(String(c.id)); setError(null); }} />
              ))}
            </View>
          ) : <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>No volunteers found yet. Enter a profile id below.</Text>}
          {input("Participant profile id (manual)", recipient, setRecipient, "e.g. 42", { keyboardType: "number-pad" })}
          {input("Recipient wallet address", wallet, setWallet, "Solana address")}
          {input("Amount (SOL)", amount, setAmount, "e.g. 0.25", { keyboardType: "decimal-pad" })}
          {input("Reason", reason, setReason, "What the volunteer is being paid for", { autoCapitalize: "sentences" })}
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Campaign (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[{ id: undefined as number | undefined, title: "None" }, ...funds.map((f) => ({ id: f.id as number | undefined, title: f.title }))].map((f) => (
              <Btn key={f.id ?? "none"} label={f.title.length > 22 ? `${f.title.slice(0, 21)}…` : f.title} variant={fundId === f.id ? "primary" : "secondary"} onPress={() => setFundId(f.id)} />
            ))}
          </View>
          {error ? <Notice tone="error" text={error} /> : null}
          <Btn label="Record proposal" icon="file-text" busy={create.isPending} testID="payout-create" onPress={submit} />
          <Btn label="Cancel" variant="secondary" onPress={() => { setOpen(false); setError(null); }} />
        </Card>
      ) : (
        <Btn label="New payout proposal" icon="plus" variant="secondary" testID="payout-new" onPress={() => { setOpen(true); setCreated(null); }} />
      )}
      <PayoutPages role="owner" empty={<EmptyBlock icon="send" title="No payout proposals" body="Proposals you record for volunteers will appear here with their verification status." />} />
    </View>
  );
}
