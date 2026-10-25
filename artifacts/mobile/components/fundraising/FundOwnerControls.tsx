import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useUpdateOrganisationFund } from "@workspace/api-client-react";
import type { OrganisationFund } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { Btn, Card, Notice, apiErrorMessage, refreshFundData } from "./shared";
import { formatSol } from "./format-sol.mjs";

export function FundStats({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const goal = Number(fund.goalSol);
  const raised = Number(fund.raisedSol);
  const progress = Number.isFinite(goal) && goal > 0 && Number.isFinite(raised)
    ? Math.max(0, Math.min(100, (raised / goal) * 100))
    : 0;
  const depositLabel = `${fund.contributionCount} verified ${fund.contributionCount === 1 ? "deposit" : "deposits"}`;
  return (
    <View
      testID={`fund-stats-${fund.id}`}
      style={{ gap: 9 }}
      accessibilityLabel={`${formatSol(fund.raisedSol)} SOL raised from ${depositLabel}; campaign goal ${formatSol(fund.goalSol)} SOL`}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
          <Text style={{ color: colors.foreground, fontSize: 23, lineHeight: 28, fontFamily: "Inter_700Bold" }}>{formatSol(fund.raisedSol)}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>SOL raised</Text>
        </View>
        <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{Math.round(progress)}% funded</Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Funding progress from verified campaign deposits"
        accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round(progress)) }}
        style={{ height: 7, borderRadius: 99, backgroundColor: colors.muted, overflow: "hidden" }}
      >
        <View style={{ width: `${progress}%`, height: "100%", borderRadius: 99, backgroundColor: colors.primary }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Feather name="check-circle" size={12} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{depositLabel}</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Campaign progress</Text>
      </View>
    </View>
  );
}

export function FundOwnerControls({ fund, onUpdated }: { fund: OrganisationFund; onUpdated: (fund: OrganisationFund) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(fund.title);
  const [description, setDescription] = useState(fund.description);
  const [goalSol, setGoalSol] = useState(String(fund.goalSol));
  const [feedback, setFeedback] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const update = useUpdateOrganisationFund();
  const closed = fund.status === "closed";

  const goalValue = Number(goalSol.trim());
  const goalFormatValid = /^(?:\d+(?:\.\d{0,9})?|\.\d{1,9})$/.test(goalSol.trim())
    && Number.isFinite(goalValue)
    && goalValue > 0
    && goalValue <= 1_000_000_000
    && Number(goalValue.toFixed(9)) === goalValue;
  const highestCheckpointSol = Math.max(0, ...(fund.milestones ?? []).map((milestone) => Number(milestone.targetSol)));
  const goalCoversCheckpoints = goalValue >= highestCheckpointSol;
  const goalValid = goalFormatValid && goalCoversCheckpoints;
  const goalChanged = goalValid && goalValue !== fund.goalSol;
  const save = (data: { title?: string; description?: string; goalSol?: number; status?: "active" | "closed" }, okText: string) => {
    setFeedback(null);
    update.mutate({ fundId: fund.id, data }, {
      onSuccess: (next) => { onUpdated(next); void refreshFundData(queryClient); setFeedback({ tone: "success", text: okText }); },
      onError: (e) => setFeedback({ tone: "error", text: apiErrorMessage(e, "The campaign could not be updated.") }),
    });
  };
  const dirty = title.trim() !== fund.title || description.trim() !== fund.description || goalChanged;
  const valid = title.trim().length >= 3 && description.trim().length >= 10 && goalValid;
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 5, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, backgroundColor: colors.background, fontSize: 13 } as const;

  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>Manage campaign</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Campaign title</Text>
      <TextInput accessibilityLabel="Campaign title" testID="fund-edit-title" value={title} maxLength={80} onChangeText={(v) => { setTitle(v); setFeedback(null); }} style={{ ...input, minHeight: 48 }} placeholderTextColor={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Campaign description</Text>
      <TextInput accessibilityLabel="Campaign description" testID="fund-edit-description" value={description} maxLength={600} onChangeText={(v) => { setDescription(v); setFeedback(null); }} multiline style={{ ...input, minHeight: 100, textAlignVertical: "top" }} placeholderTextColor={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: -7 }}>Use one organiser-provided campaign detail per line to show separate cards.</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Campaign goal</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <TextInput
          accessibilityLabel="Campaign goal in SOL"
          testID="fund-edit-goal"
          value={goalSol}
          onChangeText={(value) => { setGoalSol(value); setFeedback(null); }}
          keyboardType="decimal-pad"
          maxLength={20}
          style={{ ...input, flex: 1, minHeight: 48 }}
          placeholder="Enter a SOL goal"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>SOL</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: -7 }}>
        Use a positive amount up to 1,000,000,000 SOL and at most 9 decimal places. Updating the goal changes progress checkpoints only; recorded deposits stay the same.
      </Text>
      {goalSol.trim().length > 0 && !goalValid ? (
        <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 11, lineHeight: 16 }}>
          {!goalFormatValid
            ? "Enter a valid positive SOL goal with up to 9 decimal places."
            : `The campaign goal cannot be lower than its highest checkpoint (${highestCheckpointSol} SOL).`}
        </Text>
      ) : null}
      <Btn
        label="Save changes"
        icon="save"
        disabled={!dirty || !valid}
        busy={update.isPending}
        testID="fund-edit-save"
        onPress={() => save({
          title: title.trim(),
          description: description.trim(),
          goalSol: goalValue,
        }, "Campaign updated.")}
      />
      <Btn label={closed ? "Reopen campaign" : "Close campaign"} icon={closed ? "unlock" : "lock"} variant="secondary" busy={update.isPending} testID="fund-toggle-status" onPress={() => save({ status: closed ? "active" : "closed" }, closed ? "Campaign reopened." : "Campaign closed to new contributions.")} />
      <Notice text="Closing stops new contributions only. Financial history is kept and campaigns cannot be deleted." />
      {feedback ? <Notice {...feedback} /> : null}
    </Card>
  );
}
