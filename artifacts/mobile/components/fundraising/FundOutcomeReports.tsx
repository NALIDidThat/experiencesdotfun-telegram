import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListOrganisationFundsQueryKey,
  useCreateFundMilestoneOutcomeReport,
} from "@workspace/api-client-react";
import type {
  FundMilestoneOutcomeReport,
  FundMilestoneOutcomeReportStatus,
  OrganisationFund,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const reportStatuses: Array<{ value: FundMilestoneOutcomeReportStatus; label: string }> = [
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
];

function reportDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function ReportCard({ report }: { report: FundMilestoneOutcomeReport }) {
  const colors = useColors();
  const statusLabel = reportStatuses.find((status) => status.value === report.status)?.label ?? "Update";
  const statusColor = report.status === "completed"
    ? colors.success
    : report.status === "blocked"
      ? colors.destructive
      : colors.primary;

  return (
    <View testID={`fund-outcome-report-${report.id}`} style={{ gap: 8, padding: 11, borderRadius: colors.radius - 5, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ borderRadius: 999, backgroundColor: statusColor + "15", paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: statusColor, fontSize: 10, fontFamily: "Inter_700Bold" }}>{statusLabel}</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{reportDateLabel(report.createdAt)}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>{report.updateText}</Text>
      <View style={{ gap: 3, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.35 }}>PLANNED OUTCOME AT TIME OF UPDATE</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{report.milestoneTitle}: {report.plannedOutcome}</Text>
      </View>
      {report.evidenceUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open charity-provided evidence for ${report.milestoneTitle}`}
          testID={`fund-outcome-evidence-${report.id}`}
          onPress={() => { void Linking.openURL(report.evidenceUrl!).catch(() => undefined); }}
          style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Feather name="external-link" size={13} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Open evidence link</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Charity-reported; not independently verified.</Text>
    </View>
  );
}

export function FundOutcomeReports({ fund, canReport = false }: { fund: OrganisationFund; canReport?: boolean }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [status, setStatus] = useState<FundMilestoneOutcomeReportStatus>("in_progress");
  const [updateText, setUpdateText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newReports, setNewReports] = useState<Record<number, FundMilestoneOutcomeReport[]>>({});
  const createReport = useCreateFundMilestoneOutcomeReport({
    mutation: {
      onSuccess: (report) => {
        void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(fund.organisationUserId) });
        setNewReports((current) => ({
          ...current,
          [report.milestoneId]: [...(current[report.milestoneId] ?? []), report],
        }));
        setEditingMilestoneId(null);
        setUpdateText("");
        setEvidenceUrl("");
        setStatus("in_progress");
        setFormError(null);
        setSuccessMessage("Update published. It is now part of the public report history.");
      },
    },
  });
  const reportsForMilestone = (milestoneId: number) => {
    const reports = fund.milestones.find((milestone) => milestone.id === milestoneId)?.outcomeReports ?? [];
    return [...new Map([...reports, ...(newReports[milestoneId] ?? [])].map((report) => [report.id, report])).values()];
  };
  const milestonesWithReports = fund.milestones.filter((milestone) => reportsForMilestone(milestone.id).length > 0);
  if (!canReport && milestonesWithReports.length === 0) return null;

  const submit = async (milestoneId: number) => {
    const cleanUpdate = updateText.trim();
    const cleanEvidenceUrl = evidenceUrl.trim();
    if (cleanUpdate.length < 10) {
      setFormError("Write an update of at least 10 characters.");
      return;
    }
    if (cleanEvidenceUrl && (!/^https:\/\//i.test(cleanEvidenceUrl) || cleanEvidenceUrl.length > 2048)) {
      setFormError("Evidence links must be HTTPS and no longer than 2,048 characters.");
      return;
    }
    setFormError(null);
    setSuccessMessage(null);
    try {
      await createReport.mutateAsync({
        fundId: fund.id,
        milestoneId,
        data: {
          status,
          updateText: cleanUpdate,
          ...(cleanEvidenceUrl ? { evidenceUrl: cleanEvidenceUrl } : {}),
        },
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not publish this update. Try again.");
    }
  };

  return (
    <View testID={`fund-outcome-reports-${fund.id}`} style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, padding: 15, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="book-open" size={15} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Outcome updates</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
        Funding thresholds show verified deposits only. They do not verify outcomes or trigger payouts.
      </Text>
      {canReport ? fund.milestones.map((milestone) => (
        <View key={milestone.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11 }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>{milestone.title}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{milestone.outcome}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report an outcome update for ${milestone.title}`}
            accessibilityState={{ expanded: editingMilestoneId === milestone.id }}
            testID={`fund-outcome-report-toggle-${fund.id}-${milestone.id}`}
            onPress={() => {
              setEditingMilestoneId((current) => current === milestone.id ? null : milestone.id);
              setStatus("in_progress");
              setUpdateText("");
              setEvidenceUrl("");
              setFormError(null);
              setSuccessMessage(null);
            }}
            style={{ minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: colors.radius - 6, borderWidth: 1, borderColor: colors.primary + "45", paddingHorizontal: 10 }}
          >
            <Feather name={editingMilestoneId === milestone.id ? "x" : "edit-3"} size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>
              {editingMilestoneId === milestone.id ? "Close update form" : "Publish outcome update"}
            </Text>
          </Pressable>
          {editingMilestoneId === milestone.id ? (
            <View style={{ gap: 9, padding: 11, borderRadius: colors.radius - 5, backgroundColor: colors.background }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>This creates a dated, permanent charity-reported entry. Later updates are added to the history; earlier reports are not edited.</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {reportStatuses.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: status === option.value }}
                    testID={`fund-outcome-status-${option.value}`}
                    onPress={() => setStatus(option.value)}
                    style={{ minHeight: 36, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: status === option.value ? colors.primary : colors.border, backgroundColor: status === option.value ? colors.primary + "12" : colors.card, paddingHorizontal: 10 }}
                  >
                    <Text style={{ color: status === option.value ? colors.primary : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold" }}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Outcome update"
                testID={`fund-outcome-update-text-${milestone.id}`}
                value={updateText}
                onChangeText={(value) => { setUpdateText(value); setFormError(null); }}
                placeholder="Share what has happened so far"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={600}
                style={{ minHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 11, paddingVertical: 10, color: colors.foreground, backgroundColor: colors.card, textAlignVertical: "top", fontSize: 12 }}
              />
              <TextInput
                accessibilityLabel="Optional HTTPS evidence link"
                testID={`fund-outcome-evidence-url-${milestone.id}`}
                value={evidenceUrl}
                onChangeText={(value) => { setEvidenceUrl(value); setFormError(null); }}
                placeholder="Optional HTTPS evidence link"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={2048}
                style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 11, paddingVertical: 9, color: colors.foreground, backgroundColor: colors.card, fontSize: 12 }}
              />
              {formError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 11, lineHeight: 16 }}>{formError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={createReport.isPending ? "Publishing outcome update" : "Publish outcome update"}
                testID={`fund-outcome-submit-${fund.id}-${milestone.id}`}
                disabled={createReport.isPending}
                onPress={() => { void submit(milestone.id); }}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: colors.radius - 6, backgroundColor: colors.primary, opacity: createReport.isPending ? 0.55 : 1 }}
              >
                <Feather name="send" size={13} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontSize: 11, fontFamily: "Inter_700Bold" }}>
                  {createReport.isPending ? "Publishing…" : "Publish update"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {reportsForMilestone(milestone.id).length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>PUBLIC REPORT HISTORY</Text>
              {reportsForMilestone(milestone.id).reverse().map((report) => <ReportCard key={report.id} report={report} />)}
            </View>
          ) : null}
        </View>
      )) : milestonesWithReports.map((milestone) => (
        <View key={milestone.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>{milestone.title}</Text>
          {reportsForMilestone(milestone.id).reverse().map((report) => <ReportCard key={report.id} report={report} />)}
        </View>
      ))}
      {successMessage ? (
        <View accessibilityLiveRegion="polite">
          <Text style={{ color: colors.success, fontSize: 11, lineHeight: 16 }}>{successMessage}</Text>
        </View>
      ) : null}
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Updates are written by the charity and are not independently verified.</Text>
    </View>
  );
}
