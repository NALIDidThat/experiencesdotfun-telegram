import { useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getListMyContributionsQueryKey, useListMyContributions } from "@workspace/api-client-react";
import type { FundContribution } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ContributionSheet } from "./ContributionCheckout";
import { PayoutPages } from "./Payouts";
import { Btn, Card, EmptyBlock, ErrorBlock, NetworkBadge, SectionTitle, Skeleton, apiErrorMessage, dateLabel } from "./shared";

function Row({ c, onOpen }: { c: FundContribution; onOpen: () => void }) {
  const colors = useColors();
  const color = c.status === "confirmed" ? colors.success : c.status === "cancelled" ? colors.mutedForeground : colors.primary;
  const action = c.status === "confirmed" ? "Receipt" : "Resume / verify";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.amountSol} SOL to ${c.fundTitle}, ${c.status}. ${action}`} testID={`contribution-row-${c.id}`} onPress={onOpen}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>{c.amountSol} SOL</Text>
          <View style={{ borderRadius: 999, backgroundColor: color + "18", paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ color, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>{c.status === "pending" ? "AWAITING VERIFICATION" : c.status === "cancelled" ? "DISMISSED" : "CONFIRMED"}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 13 }}>{c.fundTitle} · {c.organisationName}</Text>
        <NetworkBadge cluster={c.cluster} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{dateLabel(c.confirmedAt ?? c.createdAt)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{action}</Text>
            <Feather name="chevron-right" size={14} color={colors.primary} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function ContributionPage({ before, first, onOpen, onMore }: { before?: string; first: boolean; onOpen: (c: FundContribution) => void; onMore: (id: string) => void }) {
  const { user } = useAuth();
  const params = before ? { before } : undefined;
  const list = useListMyContributions(params, { query: { queryKey: [...getListMyContributionsQueryKey(params), user?.id ?? "anon"], enabled: !!user, staleTime: 0 } });
  if (list.isLoading) return <><Skeleton /><Skeleton /></>;
  if (list.isError) return <ErrorBlock message={apiErrorMessage(list.error, "Your contributions could not be loaded.")} onRetry={() => { void list.refetch(); }} />;
  const rows = list.data ?? [];
  return (
    <View style={{ gap: 14 }}>
      {first && !rows.length ? <EmptyBlock icon="heart" title="No contributions yet" body="Open a campaign and start a contribution. Your payment requests and receipts will be kept here." /> : null}
      {rows.map((c) => <Row key={c.id} c={c} onOpen={() => onOpen(c)} />)}
      {rows.length >= 50 ? <Btn label="Load older contributions" icon="chevron-down" variant="secondary" testID="contributions-load-older" onPress={() => onMore(rows[rows.length - 1].id)} /> : null}
    </View>
  );
}

export function ContributionHistoryScreen({ onBack }: { onBack: () => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const [pages, setPages] = useState<Array<string | undefined>>([undefined]);
  const [selected, setSelected] = useState<FundContribution | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" testID="contributions-back" onPress={onBack} style={{ width: 44, height: 44, justifyContent: "center" }}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 21, fontFamily: "Inter_700Bold" }}>My contributions</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Private to this profile</Text>
        </View>
      </View>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={60}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { setPages([undefined]); setRefreshKey((k) => k + 1); }} tintColor={colors.primary} />}
      >
        <SectionTitle title="Payment requests and receipts" hint="Newest first, 50 per page. A request is only a receipt once verified on chain." />
        {pages.map((c, i) => <ContributionPage key={`${refreshKey}-${c ?? "first"}`} before={c} first={i === 0} onOpen={setSelected} onMore={(id) => setPages((p) => (p.includes(id) ? p : [...p, id]))} />)}

        <SectionTitle title="Payouts received" hint="Volunteer payouts a charity has proposed to you. Paid only after on-chain verification." />
        <PayoutPages key={refreshKey} role="recipient" recipientId={user?.id} empty={<EmptyBlock icon="gift" title="No payouts received" body="If a charity proposes a volunteer payout to you, it will show up here." />} />
      </KeyboardAwareScrollViewCompat>
      <ContributionSheet contribution={selected} visible={!!selected} onClose={() => setSelected(null)} />
    </View>
  );
}
