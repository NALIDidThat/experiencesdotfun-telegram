import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCancelFundContribution,
  useCreateFundContribution,
  useVerifyFundContribution,
} from "@workspace/api-client-react";
import type { FundContribution, OrganisationFund } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  Btn, Card, Field, Notice, NetworkBadge, apiErrorMessage, clusterLabel, dateLabel, explorerUrl,
  openExternal, refreshFundData, shareText,
} from "./shared";

/** Body of a payment request. Opening a wallet is never treated as payment; only verification is. */
export function ContributionRequestPanel({ contribution: initial, onDone }: { contribution: FundContribution; onDone?: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [contribution, setContribution] = useState(initial);
  const [feedback, setFeedback] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const verify = useVerifyFundContribution();
  const cancel = useCancelFundContribution();
  const c = contribution;
  const mainnet = c.cluster === "mainnet-beta";

  const doVerify = () => {
    setFeedback(null);
    verify.mutate({ contributionId: c.id }, {
      onSuccess: (next) => {
        setContribution(next);
        void refreshFundData(queryClient);
        if (next.status === "confirmed") setFeedback({ tone: "success", text: "Payment verified on chain and recorded." });
        else setFeedback({ tone: "info", text: next.verificationMessage ?? "No finalized payment found yet. Wallets can take a minute to finalize; check again shortly." });
      },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "Verification could not reach the Solana network. Nothing was lost; retry in a moment.") }),
    });
  };
  const doCancel = () => {
    setFeedback(null);
    cancel.mutate({ contributionId: c.id }, {
      onSuccess: (next) => {
        setContribution(next);
        void refreshFundData(queryClient);
        setFeedback({ tone: "info", text: "Request dismissed. This cannot cancel a transfer already sent; you can still verify a late payment." });
      },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "The request could not be dismissed. Try again.") }),
    });
  };
  const shareRequest = () => shareText(
    `Payment request for "${c.fundTitle}" (${c.organisationName})\nAmount: ${c.amountSol} SOL\nNetwork: Solana ${clusterLabel(c.cluster)}\nTreasury: ${c.walletAddress}\nReference: ${c.reference}\n\n${c.paymentUri}`,
    () => setFeedback({ tone: "error", text: "Sharing is unavailable. Select the details above instead." }),
  );
  const openWallet = () => {
    setFeedback({ tone: "info", text: "Wallet opened. This is not a payment yet: approve it there, then return and tap Verify payment." });
    openExternal(c.paymentUri, () => setFeedback({ tone: "error", text: "No wallet app could open this request. Share the request to another device or wallet." }));
  };

  if (c.status === "confirmed") {
    return (
      <View style={{ gap: 12 }} testID="contribution-receipt">
        <Card tone="primary">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="check-circle" size={20} color={colors.success} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }}>Contribution confirmed</Text>
          </View>
          <Text style={{ color: colors.foreground, fontSize: 26, fontFamily: "Inter_700Bold" }}>{c.amountSol} SOL</Text>
          <NetworkBadge cluster={c.cluster} />
          <Field label="Campaign" value={`${c.fundTitle} · ${c.organisationName}`} mono={false} />
          {c.confirmedAt ? <Field label="Confirmed" value={dateLabel(c.confirmedAt) ?? c.confirmedAt} mono={false} /> : null}
          {c.signature ? <Field label="Transaction signature" value={c.signature} /> : null}
          {c.sender ? <Field label="Sent from" value={c.sender} /> : null}
          <Field label="Treasury" value={c.walletAddress} />
        </Card>
        {c.signature ? <Btn label="View receipt on Solscan" icon="external-link" variant="secondary" testID="contribution-explorer" onPress={() => openExternal(explorerUrl("tx", c.signature as string, c.cluster), () => setFeedback({ tone: "error", text: "Could not open the explorer." }))} /> : null}
        {feedback ? <Notice {...feedback} /> : null}
        {onDone ? <Btn label="Done" onPress={onDone} testID="contribution-done" /> : null}
      </View>
    );
  }

  const cancelled = c.status === "cancelled";
  return (
    <View style={{ gap: 12 }} testID="contribution-request">
      <Card tone={mainnet ? undefined : "primary"}>
        <NetworkBadge cluster={c.cluster} />
        <Text style={{ color: colors.foreground, fontSize: 26, fontFamily: "Inter_700Bold" }}>{c.amountSol} SOL</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>For {c.fundTitle} · {c.organisationName}</Text>
        <Field label="Send to (shared charity treasury)" value={c.walletAddress} />
        <Field label="Network" value={`Solana ${clusterLabel(c.cluster)}`} mono={false} />
        <Field label="Payment reference" value={c.reference} />
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Requested {dateLabel(c.createdAt) ?? ""}{c.lastCheckedAt ? ` · last checked ${dateLabel(c.lastCheckedAt)}` : ""}</Text>
      </Card>
      <Notice
        tone={mainnet ? "error" : "info"}
        text={mainnet
          ? "Mainnet moves real SOL and confirmed transfers cannot be reversed. Make sure your wallet is on Mainnet."
          : `This is a ${c.cluster} test network request. Your wallet may ignore the network setting in the link, so switch it to ${c.cluster} before approving.`}
      />
      {cancelled ? <Notice text="This request was dismissed. If you already sent the payment with the reference above, you can still verify it." /> : null}
      <Notice text="Already approved this request in your wallet? Verify before sending again to avoid paying twice. If your wallet changes the amount or removes the reference, this request cannot be automatically credited." />
      <Btn label="Open in wallet" icon="external-link" testID="contribution-open-wallet" onPress={openWallet} />
      <Btn label="Share payment request" icon="share-2" variant="secondary" testID="contribution-share" onPress={shareRequest} />
      <Btn label={verify.isPending ? "Checking the chain…" : "Verify payment"} icon="check" variant="secondary" busy={verify.isPending} testID="contribution-verify" onPress={doVerify} />
      {feedback ? <Notice {...feedback} testID="contribution-feedback" /> : null}
      {!cancelled ? <Btn label="Dismiss request" icon="x" variant="secondary" danger busy={cancel.isPending} testID="contribution-dismiss" onPress={doCancel} /> : null}
      {onDone ? <Btn label="Close" variant="secondary" onPress={onDone} testID="contribution-close" /> : null}
    </View>
  );
}

export function ContributionSheet({ contribution, visible, onClose }: { contribution: FundContribution | null; visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>Contribution</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close contribution" testID="contribution-sheet-close" onPress={onClose} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
          {contribution ? <ContributionRequestPanel key={contribution.id} contribution={contribution} onDone={onClose} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Reusable amount entry + checkout. Creates (or resumes) a server-side payment request first. */
export function ContributeToFund({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<FundContribution | null>(null);
  const create = useCreateFundContribution();
  const closed = fund.status === "closed";

  const start = () => {
    const raw = amount.trim();
    if (!/^\d+(?:\.\d{1,9})?$/.test(raw) || Number(raw) <= 0) {
      setError("Enter a positive SOL amount with up to 9 decimal places.");
      return;
    }
    if (Number(raw) > 1_000_000_000) { setError("Enter an amount of up to 1,000,000,000 SOL."); return; }
    setError(null);
    create.mutate({ fundId: fund.id, data: { amountSol: raw } }, {
      onSuccess: (contribution) => { setActive(contribution); void refreshFundData(queryClient); },
      onError: (e) => setError(apiErrorMessage(e, "The payment request could not be created. Check your connection and try again.")),
    });
  };
  const close = () => { setActive(null); setAmount(""); void refreshFundData(queryClient); };

  if (closed) return <Notice text="This campaign is closed and is not accepting new contributions." />;
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["0.1", "0.5", "1"].map((q) => (
          <Pressable key={q} accessibilityRole="button" accessibilityLabel={`Set amount to ${q} SOL`} accessibilityState={{ selected: amount === q }} testID={`contribute-quick-${fund.id}-${q.replace(".", "-")}`} onPress={() => { setAmount(q); setError(null); }}
            style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: amount === q ? colors.primary : colors.border, backgroundColor: amount === q ? colors.primary + "12" : colors.background }}>
            <Text style={{ color: amount === q ? colors.primary : colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>{q} SOL</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          accessibilityLabel={`Contribution amount in SOL for ${fund.title}`}
          testID={`donation-amount-${fund.id}`}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={(v) => { setAmount(v); setError(null); }}
          placeholder="Amount in SOL"
          placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, minWidth: 0, minHeight: 48, borderWidth: 1, borderColor: error ? colors.destructive : colors.border, borderRadius: colors.radius - 5, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.background, fontSize: 14 }}
        />
        <Btn label="Contribute" busy={create.isPending} testID={`donate-${fund.id}`} onPress={start} />
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 11, lineHeight: 16 }}>{error}</Text> : null}
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
        You will get a payment request first. Nothing is counted until the transfer is verified on chain.
      </Text>
      <ContributionSheet contribution={active} visible={!!active} onClose={close} />
    </View>
  );
}
