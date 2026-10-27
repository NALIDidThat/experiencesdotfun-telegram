import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getGetFundCampaignActivityQueryKey, useGetFundCampaignActivity } from "@workspace/api-client-react";
import type { OrganisationFund } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { formatSol } from "./format-sol.mjs";

function outcomeCards(description: string) {
  return description
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, ""))
    .filter(Boolean);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CampaignTrackerInsights({
  fund,
  showProgress = true,
  section,
}: {
  fund: OrganisationFund;
  showProgress?: boolean;
  section?: "overview" | "community" | "impact";
}) {
  const colors = useColors();
  const [supporterPeriod, setSupporterPeriod] = useState<"all" | "month">("all");
  const activityQuery = useGetFundCampaignActivity(fund.id, supporterPeriod, {
    query: {
      queryKey: getGetFundCampaignActivityQueryKey(fund.id, supporterPeriod),
      staleTime: 30_000,
      enabled: section !== "impact",
    },
  });
  const activity = activityQuery.data;
  const goal = Number(fund.goalSol);
  const raised = Number(fund.raisedSol);
  const progress = Number.isFinite(goal) && goal > 0 && Number.isFinite(raised)
    ? Math.max(0, (raised / goal) * 100)
    : 0;
  const progressLabel = Math.round(progress);
  const outcomes = outcomeCards(fund.description);

  return (
    <View style={{ gap: 14 }}>
      {showProgress && (!section || section === "overview") ? (
        <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, padding: 15, gap: 11 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>Funding progress</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Verified campaign-linked deposits only</Text>
            </View>
            <Text style={{ color: colors.primary, fontSize: 20, fontFamily: "Inter_700Bold" }}>{progressLabel}%</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${progressLabel}% of campaign goal funded`}
            accessibilityValue={{ min: 0, max: 100, now: Math.min(100, progressLabel) }}
            style={{ height: 9, borderRadius: 99, backgroundColor: colors.muted, overflow: "hidden" }}
          >
            <View style={{ width: `${Math.min(100, progress)}%`, height: "100%", borderRadius: 99, backgroundColor: colors.primary }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>{formatSol(fund.raisedSol)} SOL raised</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Goal · {formatSol(fund.goalSol)} SOL</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <View style={{ flex: 1, backgroundColor: colors.muted, borderRadius: colors.radius - 5, padding: 10, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>{activity ? activity.supporterWalletCount : "—"}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Anonymous supporters</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.muted, borderRadius: colors.radius - 5, padding: 10, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>{fund.contributionCount}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Verified deposits</Text>
            </View>
          </View>
        </View>
      ) : null}

      {!section || section === "impact" ? (
        <View style={{ gap: 10 }}>
        <View style={{ gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>What this supports</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Campaign details provided by the organiser.</Text>
        </View>
        {outcomes.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {outcomes.map((outcome, index) => (
              <View key={`${index}-${outcome}`} style={{
                flexGrow: 1,
                flexBasis: index === 0 || outcome.length > 92 ? "100%" : "46%",
                minWidth: 145,
                minHeight: 86,
                borderWidth: 1,
                borderColor: index === 0 ? colors.primary + "32" : colors.border,
                backgroundColor: index === 0 ? colors.primary + "09" : colors.card,
                borderRadius: colors.radius + 1,
                padding: 13,
                gap: 8,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="check-circle" size={13} color={index === 0 ? colors.primary : colors.secondary} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>CAMPAIGN DETAIL {String(index + 1).padStart(2, "0")}</Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: "Inter_600SemiBold" }}>{outcome}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 13 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>The organiser has not added campaign details yet.</Text>
          </View>
        )}
        <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>These are organiser-provided details, not independently verified outcomes.</Text>
        </View>
      ) : null}

      {!section || section === "community" ? (
        <>
      <View style={{ gap: 10 }}>
        <View style={{ gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>Recent contributions</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Most recent verified deposits linked to this campaign.</Text>
        </View>
        {activityQuery.isLoading ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading campaign activity" style={{ minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Loading verified activity…</Text>
          </View>
        ) : activityQuery.isError ? (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, padding: 13, gap: 6 }}>
            <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 11 }}>Campaign activity could not be loaded.</Text>
            <Pressable accessibilityRole="button" onPress={() => { void activityQuery.refetch(); }} style={{ minHeight: 40, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Try again</Text>
            </Pressable>
          </View>
        ) : !activity?.recentContributions.length ? (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, padding: 13 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17 }}>No verified campaign-linked contributions yet.</Text>
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius + 2, backgroundColor: colors.card, paddingHorizontal: 12 }}>
            {activity.recentContributions.map((contribution, index) => (
              <View key={contribution.id} style={{ minHeight: 57, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: index === activity.recentContributions.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.success + "12" }}>
                  <Feather name="arrow-down-left" size={14} color={colors.success} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_700Bold" }}>Anonymous supporter</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{formatDate(contribution.confirmedAt)}</Text>
                </View>
                <Text style={{ color: colors.success, fontSize: 11, fontFamily: "Inter_700Bold" }}>+{formatSol(contribution.amountSol)} SOL</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius + 2, backgroundColor: colors.card, padding: 14, gap: 9 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Top supporters</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Ranked by verified campaign contributions</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 1 }}>
            <Text style={{ color: colors.primary, fontSize: 14, fontFamily: "Inter_700Bold" }}>{activity?.supporterWalletCount ?? "—"}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>supporters</Text>
          </View>
        </View>
          <View accessibilityRole="tablist" accessibilityLabel="Top supporter time period" style={{ flexDirection: "row", alignSelf: "flex-start", gap: 6, borderRadius: 999, backgroundColor: colors.muted, padding: 3 }}>
            {([
              ["all", "All Time"],
              ["month", "This Month"],
            ] as const).map(([value, label]) => {
              const selected = supporterPeriod === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  testID={`fund-supporter-period-${fund.id}-${value}`}
                  onPress={() => setSupporterPeriod(value)}
                  style={{ minHeight: 34, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, backgroundColor: selected ? colors.primary : "transparent" }}
                >
                  <Text style={{ color: selected ? colors.primaryForeground : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold" }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        {activityQuery.isLoading ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Loading supporter totals…</Text>
        ) : activityQuery.isError ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Supporter totals are unavailable right now.</Text>
        ) : !activity?.topSupporters.length ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Supporter rankings will appear after the first verified contribution.</Text>
        ) : (
          activity.topSupporters.map((supporter, index) => (
            <View key={supporter.rank} style={{ minHeight: 47, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 }}>
              <View style={{ width: 25, height: 25, borderRadius: 9, backgroundColor: index === 0 ? colors.primary + "14" : colors.muted, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: index === 0 ? colors.primary : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold" }}>{supporter.rank}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_700Bold" }}>Anonymous supporter #{supporter.rank}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>{supporter.contributionCount} verified {supporter.contributionCount === 1 ? "deposit" : "deposits"}</Text>
              </View>
              <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_700Bold" }}>{formatSol(supporter.amountSol)} SOL</Text>
            </View>
          ))
        )}
        <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Wallet identities are not shown. Only campaign-attributed deposits are included.</Text>
      </View>
        </>
      ) : null}
    </View>
  );
}
