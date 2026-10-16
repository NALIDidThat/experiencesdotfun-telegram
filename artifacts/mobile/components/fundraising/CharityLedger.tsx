import { useState } from "react";
import { Text, View } from "react-native";
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
  Btn, Card, EmptyBlock, ErrorBlock, Field, Notice, SectionTitle, Skeleton, apiErrorMessage, clusterLabel,
  dateLabel, explorerUrl, openExternal, refreshFundData,
} from "./shared";

const attributionCopy: Record<CharityContributionLedgerEntry["attribution"], string> = {
  reference: "Matched to a verified payment request",
  memo: "Campaign memo only; sender profile not verified",
  unattributed: "Unattributed incoming transfer",
};

function Entry({ entry }: { entry: CharityContributionLedgerEntry }) {
  const colors = useColors();
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>+{entry.amountSol} SOL</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{clusterLabel(entry.cluster)}</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{dateLabel(entry.blockTime) ?? `Recorded ${dateLabel(entry.recordedAt)}`}</Text>
      <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>{attributionCopy[entry.attribution]}{entry.fundTitle ? ` · ${entry.fundTitle}` : ""}</Text>
      <Field label="Sending address" value={entry.sender} />
      <Field label="Signature" value={entry.signature} />
      <Btn label="View on Solscan" icon="external-link" variant="secondary" onPress={() => openExternal(explorerUrl("tx", entry.signature, entry.cluster))} />
    </Card>
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
    <View style={{ gap: 10 }}>
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
      <SectionTitle title="Contribution ledger" hint="Saved incoming transfers. Independent of the live balance check." />
      {head.isLoading ? <Skeleton height={140} /> : head.isError ? (
        <ErrorBlock message={apiErrorMessage(head.error, "The ledger could not be loaded.")} onRetry={() => { void head.refetch(); }} />
      ) : ledger ? (
        <Card tone="primary">
          <Field label="Recorded incoming (not spendable balance)" value={`${ledger.totalSol} SOL`} mono={false} />
          <Field label="Of which unattributed" value={`${ledger.unattributedSol} SOL`} mono={false} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            {ledger.lastSyncedAt ? `Last synced ${dateLabel(ledger.lastSyncedAt)}. ` : "Never synced. "}
            {ledger.historyComplete ? "All history available from the RPC has been imported." : "Imported history may be partial. Syncing the latest page restarts the backfill, so import older pages again after a refresh."}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
            Totals are recorded transfers into the treasury, not what the treasury can currently spend. Unattributed transfers have no verified donor.
          </Text>
        </Card>
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
