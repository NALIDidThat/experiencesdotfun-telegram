import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCharityContributionLedgerQueryKey,
  useGetCharityContributionLedger,
  useSyncCharityContributionLedger,
} from "@workspace/api-client-react";
import type { CharityContributionLedgerEntry } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  Btn, EmptyBlock, ErrorBlock, Notice, SectionTitle, Skeleton, apiErrorMessage, clusterLabel,
  dateLabel, explorerUrl, openExternal, refreshFundData,
} from "./shared";

const attributionCopy: Record<CharityContributionLedgerEntry["attribution"], string> = {
  reference: "Matched to a verified payment request",
  memo: "Campaign memo only; sender profile not verified",
  unattributed: "Unattributed incoming transfer",
};

function Entry({ entry }: { entry: CharityContributionLedgerEntry }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const attributionLabel = entry.attribution === "reference"
    ? "Verified request"
    : entry.attribution === "memo"
      ? "Memo only"
      : "Unattributed";
  const date = dateLabel(entry.blockTime) ?? `Recorded ${dateLabel(entry.recordedAt)}`;
  const shortAddress = (value: string) => value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-7)}` : value;
  return (
    <View style={{ borderWidth: 1, borderColor: expanded ? colors.primary + "45" : colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, overflow: "hidden" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Contribution ${entry.amountSol} SOL, ${date}, ${attributionLabel}${entry.fundTitle ? `, ${entry.fundTitle}` : ""}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 13, paddingVertical: 11 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
          <Feather name="arrow-down-left" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, lineHeight: 20, fontFamily: "Inter_700Bold" }}>+{entry.amountSol} <Text style={{ color: colors.primary, fontSize: 12 }}>SOL</Text></Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>{date} · {clusterLabel(entry.cluster)}</Text>
          {entry.fundTitle && entry.attribution !== "unattributed" ? (
            <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>
              {entry.attribution === "reference" ? "Request match" : "Memo mention"} · {entry.fundTitle}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: entry.attribution === "unattributed" ? colors.muted : colors.primary + "12" }}>
            <Text style={{ color: entry.attribution === "unattributed" ? colors.mutedForeground : colors.primary, fontSize: 9, fontFamily: "Inter_700Bold" }}>{attributionLabel}</Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 13, paddingTop: 11, gap: 9 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{attributionCopy[entry.attribution]}</Text>
          <View style={{ gap: 3 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>SENDING ADDRESS</Text>
            <Text accessibilityLabel={`Sending address: ${entry.sender}`} selectable style={{ color: colors.foreground, fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" }}>{entry.sender}</Text>
          </View>
          <View style={{ gap: 3 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>SIGNATURE</Text>
            <Text accessibilityLabel={`Signature: ${entry.signature}`} selectable style={{ color: colors.foreground, fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium" }}>{entry.signature}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View contribution on Solscan"
            onPress={() => openExternal(explorerUrl("tx", entry.signature, entry.cluster))}
            style={{ minHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>View on Solscan</Text>
            <Feather name="external-link" size={14} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function LedgerPage({ before, onMore, first }: { before?: number; onMore: (cursor: number) => void; first: boolean }) {
  const { user } = useAuth();
  const q = useGetCharityContributionLedger(before ? { before } : undefined, {
    query: { queryKey: [...getGetCharityContributionLedgerQueryKey(before ? { before } : undefined), user?.id ?? "anon"] },
  });
  if (q.isLoading) return <Skeleton height={120} />;
  if (q.isError) return <ErrorBlock message={apiErrorMessage(q.error, "The ledger page could not be loaded.")} onRetry={() => { void q.refetch(); }} />;
  const data = q.data;
  if (!data) return null;
  return (
    <View style={{ gap: 9 }}>
      {first && !data.entries.length ? <EmptyBlock icon="inbox" title="No incoming transfers recorded" body="Sync the recent page to import finalized incoming SOL from your treasury." /> : null}
      {data.entries.map((e) => <Entry key={e.id} entry={e} />)}
      {data.nextCursor ? <Btn label="Show older recorded entries" icon="chevron-down" variant="secondary" testID="ledger-more" onPress={() => onMore(data.nextCursor as number)} /> : null}
    </View>
  );
}

export function CharityLedgerSection() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pages, setPages] = useState<Array<number | undefined>>([undefined]);
  const [feedback, setFeedback] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const head = useGetCharityContributionLedger(undefined, { query: { queryKey: [...getGetCharityContributionLedgerQueryKey(undefined), user?.id ?? "anon"] } });
  const sync = useSyncCharityContributionLedger();
  const ledger = head.data;

  const run = (before: string | undefined, label: string) => {
    setFeedback(null);
    sync.mutate({ data: before ? { before } : {} }, {
      onSuccess: (r) => {
        void refreshFundData(queryClient);
        setFeedback({ tone: "success", text: `${label}: imported ${r.imported} transfer${r.imported === 1 ? "" : "s"}. ${r.hasMore ? "More older history is available from the RPC." : "No older history was returned."}` });
      },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "Sync failed. Existing ledger entries are unchanged; retry shortly.") }),
    });
  };

  return (
    <View style={{ gap: 10 }} testID="charity-ledger">
      <SectionTitle title="Contribution ledger" hint="Recorded incoming transfers · separate from spendable balance" />
      {head.isLoading ? <Skeleton height={140} /> : head.isError ? (
        <ErrorBlock message={apiErrorMessage(head.error, "The ledger could not be loaded.")} onRetry={() => { void head.refetch(); }} />
      ) : ledger ? (
        <View style={{ borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.primary + "08", borderRadius: colors.radius + 3, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: colors.primary + "22", paddingRight: 8, gap: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 }}>RECORDED INCOMING</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>{ledger.totalSol} <Text style={{ color: colors.primary, fontSize: 13 }}>SOL</Text></Text>
            </View>
            <View style={{ flex: 1, paddingLeft: 3, gap: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 }}>UNATTRIBUTED</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>{ledger.unattributedSol} <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>SOL</Text></Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: colors.primary + "20", paddingTop: 9 }}>
            <Feather name={ledger.historyComplete ? "check-circle" : "clock"} size={13} color={ledger.historyComplete ? colors.success : colors.primary} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
              {ledger.lastSyncedAt ? `Synced ${dateLabel(ledger.lastSyncedAt)} · ` : "Never synced · "}
              {ledger.historyComplete ? "Available history imported" : "History may be partial"}
            </Text>
          </View>
          {!ledger.historyComplete ? <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Syncing recent activity restarts backfill; import older pages again after a refresh.</Text> : null}
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Recorded transfers are not the current spendable balance. Unattributed entries have no verified campaign link.</Text>
        </View>
      ) : null}
      <Btn label="Sync recent page" icon="refresh-cw" busy={sync.isPending} testID="ledger-sync-recent" onPress={() => run(undefined, "Recent page")} />
      {ledger && !ledger.historyComplete && ledger.historyCursor ? (
        <Btn label="Import older history" icon="download" variant="secondary" busy={sync.isPending} testID="ledger-import-older" onPress={() => run(ledger.historyCursor as string, "Older page")} />
      ) : null}
      {feedback ? <Notice {...feedback} testID="ledger-feedback" /> : null}
      {pages.map((cursor, i) => (
        <LedgerPage key={cursor ?? "first"} before={cursor} first={i === 0} onMore={(next) => setPages((p) => (p.includes(next) ? p : [...p, next]))} />
      ))}
    </View>
  );
}
