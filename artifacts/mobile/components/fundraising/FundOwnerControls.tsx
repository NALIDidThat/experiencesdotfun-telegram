import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateOrganisationFund } from "@workspace/api-client-react";
import type { OrganisationFund } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Btn, Card, Notice, apiErrorMessage, refreshFundData } from "./shared";

export function FundStats({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  return (
    <View style={{ gap: 3 }} accessibilityLabel={`${fund.raisedSol} SOL recorded from ${fund.contributionCount} finalized deposits, goal ${fund.goalSol} SOL`}>
      <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>
        {fund.raisedSol} SOL <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>raised of {fund.goalSol.toLocaleString()} SOL goal</Text>
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
        {fund.contributionCount} recorded finalized {fund.contributionCount === 1 ? "deposit" : "deposits"}. Progress counts recorded deposits, not the treasury balance.
      </Text>
    </View>
  );
}

export function FundOwnerControls({ fund, onUpdated }: { fund: OrganisationFund; onUpdated: (fund: OrganisationFund) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(fund.title);
  const [description, setDescription] = useState(fund.description);
  const [feedback, setFeedback] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const update = useUpdateOrganisationFund();
  const closed = fund.status === "closed";

  const save = (data: { title?: string; description?: string; status?: "active" | "closed" }, okText: string) => {
    setFeedback(null);
    update.mutate({ fundId: fund.id, data }, {
      onSuccess: (next) => { onUpdated(next); void refreshFundData(queryClient); setFeedback({ tone: "success", text: okText }); },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "The campaign could not be updated.") }),
    });
  };
  const dirty = title.trim() !== fund.title || description.trim() !== fund.description;
  const valid = title.trim().length >= 3 && description.trim().length >= 10;
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 5, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, backgroundColor: colors.background, fontSize: 13 } as const;

  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>Manage campaign</Text>
      <TextInput accessibilityLabel="Campaign title" testID="fund-edit-title" value={title} onChangeText={(v) => { setTitle(v); setFeedback(null); }} style={{ ...input, minHeight: 48 }} placeholderTextColor={colors.mutedForeground} />
      <TextInput accessibilityLabel="Campaign description" testID="fund-edit-description" value={description} onChangeText={(v) => { setDescription(v); setFeedback(null); }} multiline style={{ ...input, minHeight: 100, textAlignVertical: "top" }} placeholderTextColor={colors.mutedForeground} />
      <Btn label="Save changes" icon="save" disabled={!dirty || !valid} busy={update.isPending} testID="fund-edit-save" onPress={() => save({ title: title.trim(), description: description.trim() }, "Campaign updated.")} />
      <Btn label={closed ? "Reopen campaign" : "Close campaign"} icon={closed ? "unlock" : "lock"} variant="secondary" busy={update.isPending} testID="fund-toggle-status" onPress={() => save({ status: closed ? "active" : "closed" }, closed ? "Campaign reopened." : "Campaign closed to new contributions.")} />
      <Notice text="Closing stops new contributions only. Financial history is kept and campaigns cannot be deleted." />
      {feedback ? <Notice {...feedback} /> : null}
    </Card>
  );
}
