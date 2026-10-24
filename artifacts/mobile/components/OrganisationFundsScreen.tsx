import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, GestureResponderEvent, Image, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetHostOverviewQueryKey,
  getGetOrganisationTreasuryQueryKey,
  getListOrganisationFundsQueryKey,
  getListFundPayoutsQueryKey,
  getListHostExperiencesQueryKey,
  useCreateOrganisationFund,
  useGetHostOverview,
  useListFundPayouts,
  useListHostExperiences,
  useGetOrganisationTreasury,
  useListOrganisationFunds,
  useRegisterOrganisationTreasury,
} from "@workspace/api-client-react";
import type { FundPayout, HostExperience, HostOverview, OrganisationFund, OrganisationTreasuryDashboard, OrganisationTreasuryInput } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { ContributeToFund } from "@/components/fundraising/ContributionCheckout";
import { CampaignTrackerInsights } from "@/components/fundraising/CampaignTrackerInsights";
import { CharityPayoutsSection } from "@/components/fundraising/Payouts";
import { FundOwnerControls, FundStats } from "@/components/fundraising/FundOwnerControls";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { isValidSolanaAddress } from "@/lib/solana-pay.mjs";

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function solscanUrl(path: string, cluster: string) {
  return `https://solscan.io/${path}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

function TreasuryActivityEntry({
  transaction,
  cluster,
  campaignLabel,
}: {
  transaction: OrganisationTreasuryDashboard["transactions"][number];
  cluster: string;
  campaignLabel: string | null;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const confirmed = transaction.status === "confirmed";
  const failed = transaction.status === "failed";
  const statusColor = confirmed ? colors.success : failed ? colors.destructive : colors.mutedForeground;
  const amountLabel = confirmed && transaction.amountSol
    ? `+${transaction.amountSol} SOL`
    : failed ? "Failed transaction" : "Details unavailable";
  const attributionLabel = confirmed && transaction.campaignId
    ? `Verified campaign · ${campaignLabel ?? `#${transaction.campaignId}`}`
    : confirmed ? "No verified campaign link" : "Not a confirmed incoming contribution";
  const date = transactionDateLabel(transaction.blockTime) ?? "Date unavailable";

  const detail = (label: string, value: string) => (
    <View style={{ gap: 3 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>{label}</Text>
      <Text selectable style={{ color: colors.foreground, fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" }}>{value}</Text>
    </View>
  );

  return (
    <View style={{ borderWidth: 1, borderColor: expanded ? colors.primary + "45" : colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, overflow: "hidden" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${amountLabel}, ${date}, ${transaction.status}, ${attributionLabel}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{ minHeight: 76, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ width: 31, height: 31, borderRadius: 11, backgroundColor: statusColor + "14", alignItems: "center", justifyContent: "center" }}>
          <Feather name={confirmed ? "arrow-down-left" : failed ? "x" : "clock"} size={15} color={statusColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{amountLabel}</Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>{date}</Text>
          <Text numberOfLines={1} style={{ color: confirmed && transaction.campaignId ? colors.primary : colors.mutedForeground, fontSize: 10 }}>{attributionLabel}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <View style={{ borderRadius: 999, backgroundColor: statusColor + "12", paddingHorizontal: 8, paddingVertical: 5 }}>
            <Text style={{ color: statusColor, fontFamily: "Inter_700Bold", fontSize: 9, textTransform: "uppercase" }}>{transaction.status}</Text>
          </View>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 10 }}>
          {transaction.sender ? detail("SENDER ADDRESS", transaction.sender) : detail("SENDER ADDRESS", "Unavailable")}
          {detail("SIGNATURE", transaction.signature)}
          {detail("NETWORK", cluster === "mainnet-beta" ? "Solana Mainnet" : `Solana ${cluster}`)}
          {detail(
            "CAMPAIGN LINK",
            confirmed && transaction.campaignId
              ? `${campaignLabel ?? "Campaign"} · ID ${transaction.campaignId}`
              : transaction.campaignId
                ? `ID ${transaction.campaignId} present · not attributed because this transaction is not confirmed`
                : "None recorded",
          )}
          {transaction.error ? (
            <View style={{ gap: 3 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>TRANSACTION DETAIL</Text>
              <Text selectable style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{transaction.error}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View transaction ${shortAddress(transaction.signature)} on Solscan`}
            onPress={() => { void Linking.openURL(solscanUrl(`tx/${transaction.signature}`, cluster)); }}
            style={{ minHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>View on Solscan</Text>
            <Feather name="external-link" size={14} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function transactionDateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function campaignProgress(fund: OrganisationFund) {
  const goal = Number(fund.goalSol);
  const raised = Number(fund.raisedSol);
  return Number.isFinite(goal) && goal > 0 && Number.isFinite(raised)
    ? Math.max(0, Math.min(100, raised / goal * 100))
    : 0;
}

function formatCampaignSol(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  if (amount === 0) return "0";
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(amount) < 0.0001 ? 9 : 4,
  });
}

function CampaignProgressCard({ fund, onPress }: { fund: OrganisationFund; onPress: () => void }) {
  const colors = useColors();
  const progress = campaignProgress(fund);
  const raised = formatCampaignSol(fund.raisedSol);
  const goal = formatCampaignSol(fund.goalSol);
  const creatorUsername = fund.creatorUsername?.trim().replace(/^@+/, "") ?? "";
  const depositLabel = `${fund.contributionCount} verified ${fund.contributionCount === 1 ? "deposit" : "deposits"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${fund.title}, ${creatorUsername ? `created by @${creatorUsername}, ` : ""}${raised} SOL raised of ${goal} SOL goal, ${depositLabel}, ${Math.round(progress)}% funded`}
      accessibilityHint="Opens campaign details."
      testID={`campaign-progress-${fund.id}`}
      onPress={onPress}
      style={({ pressed }) => ({
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        borderRadius: colors.radius + 8,
        shadowColor: "#170d20",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
        elevation: 2,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <View style={{ padding: 12, gap: 14 }}>
        <View style={{ padding: 13, gap: 9, borderRadius: colors.radius + 2, backgroundColor: colors.primary + "0D" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
              <Feather name="heart" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ color: colors.primary, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 }}>COMMUNITY FUNDRAISER</Text>
              <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 16, lineHeight: 21, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Feather name="user" size={11} color={colors.mutedForeground} />
                <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {creatorUsername ? `Created by @${creatorUsername}` : `Fundraiser by ${fund.organisationName}`}
                </Text>
              </View>
            </View>
            <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}>
              <Feather name="arrow-up-right" size={16} color={colors.foreground} />
            </View>
          </View>
          {fund.experienceTitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.primary + "20" }}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>Supports {fund.experienceTitle}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 4, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.55 }}>RAISED SO FAR</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.foreground, fontSize: 25, lineHeight: 30, fontFamily: "Inter_700Bold" }}>{raised}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold" }}>SOL</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.muted + "80" }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.55 }}>GOAL</Text>
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 2 }}>{goal} <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>SOL</Text></Text>
              <Text style={{ color: colors.secondary, fontSize: 9, fontFamily: "Inter_700Bold", marginTop: 3 }}>{Math.round(progress)}% funded</Text>
            </View>
          </View>

          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${Math.round(progress)}% of campaign goal`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
            style={{ height: 7, overflow: "hidden", borderRadius: 999, backgroundColor: colors.primary + "16" }}
          >
            <View style={{ width: `${progress}%`, height: "100%", borderRadius: 999, backgroundColor: colors.primary }} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <Feather name="shield" size={13} color={colors.secondary} />
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{depositLabel}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ color: colors.primaryForeground, fontSize: 11, fontFamily: "Inter_700Bold" }}>View fundraiser</Text>
              <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ExpandableMetric({
  label,
  value,
  icon,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  expanded: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      aria-expanded={expanded}
      testID={`treasury-metric-${label.toLowerCase().replaceAll(" ", "-")}`}
      onPress={onPress}
      style={{ flex: 1, minWidth: "46%", minHeight: 88, borderWidth: 1, borderColor: expanded ? colors.primary + "55" : colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 8, padding: 12, gap: 7 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon} size={15} color={colors.primary} />
        </View>
        <Feather name={expanded ? "chevron-down" : "chevron-right"} size={15} color={colors.mutedForeground} />
      </View>
      <View style={{ gap: 3 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.foreground, fontSize: 18, lineHeight: 21, fontFamily: "Inter_700Bold" }}>{value}</Text>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.35 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

type TreasuryMetric = "raised" | "participants" | "experiences" | "rewarded";

function TreasuryMetricDetailsSheet({
  metric,
  overview,
  funds,
  fundsLoading,
  fundsError,
  retryFunds,
  experiences,
  experiencesLoading,
  experiencesError,
  retryExperiences,
  payouts,
  payoutsLoading,
  payoutsError,
  retryPayouts,
  loadedPayouts,
  onLoadMorePayouts,
  hasMorePayouts,
  payoutsFetching,
  onClose,
}: {
  metric: TreasuryMetric | null;
  overview?: HostOverview;
  funds?: OrganisationFund[];
  fundsLoading: boolean;
  fundsError: boolean;
  retryFunds: () => void;
  experiences?: HostExperience[];
  experiencesLoading: boolean;
  experiencesError: boolean;
  retryExperiences: () => void;
  payouts?: FundPayout[];
  payoutsLoading: boolean;
  payoutsError: boolean;
  retryPayouts: () => void;
  loadedPayouts: FundPayout[];
  onLoadMorePayouts: () => void;
  hasMorePayouts: boolean;
  payoutsFetching: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const title = metric === "raised" ? "Campaign raised" : metric === "participants" ? "Participant entries" : metric === "experiences" ? "Experiences" : "Rewarded users";
  const totalRaised = funds?.reduce((total, fund) => total + Number(fund.raisedSol || 0), 0) ?? 0;
  const count = metric === "raised" ? (funds ? `${totalRaised.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL` : "—")
    : metric === "participants" ? (overview ? String(overview.participantCount) : "—")
      : metric === "experiences" ? (overview ? String(overview.totalExperiences) : "—")
        : (overview ? String(overview.rewardedUserCount) : "—");
  const summaryLabel = metric === "raised" ? "verified campaign contributions"
    : metric === "participants" ? "participant entries"
      : metric === "experiences" ? "hosted experiences"
        : "distinct paid recipients";
  const summaryDescription = metric === "raised"
    ? "Across OrganisationFund records. This is not the shared treasury balance."
    : metric === "participants"
      ? "Entries across experiences. A person joining multiple experiences can count more than once."
      : metric === "experiences"
        ? "Experiences owned by your organisation, whether or not they have a fundraiser."
        : "Distinct recipients whose payouts have been verified paid on chain.";
  const showExperienceLoading = metric === "participants" || metric === "experiences";
  const showError = metric === "raised" ? fundsError : showExperienceLoading ? experiencesError : metric === "rewarded" ? payoutsError : false;
  const loading = metric === "raised" ? fundsLoading : showExperienceLoading ? experiencesLoading : metric === "rewarded" ? payoutsLoading : false;
  const retry = metric === "raised" ? retryFunds : showExperienceLoading ? retryExperiences : retryPayouts;
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 7 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
    onPanResponderRelease: (_event, gesture) => { if (gesture.dy > 72 && gesture.vy >= 0) onClose(); },
  })).current;
  const webTouch = useRef({ startX: 0, startY: 0, lastY: 0, verticalDrag: false });
  const onWebTouchStart = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    webTouch.current = { startX: pageX, startY: pageY, lastY: pageY, verticalDrag: false };
  };
  const onWebTouchMove = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    const touch = webTouch.current;
    const deltaX = pageX - touch.startX;
    const deltaY = pageY - touch.startY;
    touch.lastY = pageY;
    if (!touch.verticalDrag && Math.abs(deltaY) > 7 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
      touch.verticalDrag = true;
    }
    if (touch.verticalDrag) event.preventDefault();
  };
  const onWebTouchEnd = () => {
    const touch = webTouch.current;
    if (touch.verticalDrag && touch.lastY - touch.startY > 72) onClose();
    webTouch.current = { startX: 0, startY: 0, lastY: 0, verticalDrag: false };
  };
  const onWebTouchCancel = () => {
    webTouch.current = { startX: 0, startY: 0, lastY: 0, verticalDrag: false };
  };
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "Date unavailable";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  const statusLabel = (status: string) => status.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const state = (icon: keyof typeof Feather.glyphMap, heading: string, body: string) => (
    <View style={{ alignItems: "center", paddingHorizontal: 20, paddingVertical: 28, gap: 10 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
        <Feather name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 22, fontFamily: "Inter_700Bold", textAlign: "center" }}>{heading}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: "center" }}>{body}</Text>
    </View>
  );
  const record = (key: string, heading: string, meta: string, trailing?: string, submeta?: string) => (
    <View key={key} testID={`treasury-metric-record-${key}`} style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
        <Feather name={metric === "raised" ? "trending-up" : metric === "rewarded" ? "award" : metric === "participants" ? "users" : "calendar"} size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 14, lineHeight: 19, fontFamily: "Inter_600SemiBold" }}>{heading}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{meta}</Text>
        {submeta ? <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, marginTop: 2 }}>{submeta}</Text> : null}
      </View>
      {trailing ? <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "right" }}>{trailing}</Text> : null}
    </View>
  );
  const paidRecipients = new Map<number, FundPayout>();
  for (const payout of loadedPayouts) {
    if (payout.status === "paid" && !paidRecipients.has(payout.recipientUserId)) paidRecipients.set(payout.recipientUserId, payout);
  }
  const noRows = metric === "raised" ? !funds?.length
    : metric === "participants" ? !experiences?.some((experience) => experience.participantCount > 0)
      : metric === "experiences" ? !experiences?.length
        : !paidRecipients.size;

  if (!metric) return null;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(16,16,22,0.48)" }}>
        <Pressable testID="treasury-metric-backdrop" accessibilityRole="button" accessibilityLabel="Close treasury metric details" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={{ height: "94%", maxHeight: "98%", paddingTop: 12, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <View
            {...(Platform.OS === "web" ? {} : panResponder.panHandlers)}
            onTouchStart={Platform.OS === "web" ? onWebTouchStart : undefined}
            onTouchMove={Platform.OS === "web" ? onWebTouchMove : undefined}
            onTouchEnd={Platform.OS === "web" ? onWebTouchEnd : undefined}
            onTouchCancel={Platform.OS === "web" ? onWebTouchCancel : undefined}
            testID="treasury-metric-swipe-handle"
            accessibilityHint="Swipe down to close"
            style={{ alignItems: "center", paddingBottom: 13 }}
          >
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 13 }} />
            <View style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.primary, fontSize: 10, letterSpacing: 1, fontFamily: "Inter_700Bold", marginBottom: 4 }}>TREASURY SUMMARY</Text>
                <Text style={{ color: colors.foreground, fontSize: 23, lineHeight: 29, fontFamily: "Inter_700Bold" }}>{title}</Text>
              </View>
              <Pressable testID="treasury-metric-close" accessibilityRole="button" accessibilityLabel="Close summary" onPress={onClose} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.65 : 1 })}>
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.muted, borderRadius: colors.radius }}>
            <Text style={{ color: colors.primary, fontSize: 32, lineHeight: 39, fontFamily: "Inter_700Bold" }}>{count}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_700Bold" }}>{summaryLabel}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{summaryDescription}</Text>
            </View>
            <Feather name={metric === "raised" ? "trending-up" : metric === "participants" ? "users" : metric === "experiences" ? "calendar" : "award"} size={20} color={colors.primary} />
          </View>
          <ScrollView style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View accessibilityRole="progressbar" accessibilityLabel={`Loading ${title.toLowerCase()}`} style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading records…</Text>
              </View>
            ) : showError ? (
              <View style={{ alignItems: "center", padding: 24, gap: 10 }}>
                <Feather name="alert-circle" size={23} color={colors.destructive} />
                <Text accessibilityRole="alert" style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" }}>Couldn’t load these records</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>The saved summary remains available. Try again to reload its details.</Text>
                <Pressable testID="treasury-metric-retry" accessibilityRole="button" onPress={retry} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Feather name="refresh-cw" size={14} color={colors.primary} /><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Try again</Text>
                </Pressable>
              </View>
            ) : metric === "raised" && funds?.length ? funds.map((fund) => {
              const amount = Number(fund.raisedSol);
              return record(`fund-${fund.id}`, fund.title, `${fund.experienceTitle ? `For ${fund.experienceTitle} · ` : ""}${fund.contributionCount} verified ${fund.contributionCount === 1 ? "contribution" : "contributions"}`, `${Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : fund.raisedSol} / ${fund.goalSol} SOL`, "Verified raised amount · goal");
            }) : (metric === "participants" || metric === "experiences") && experiences?.length ? (
              metric === "participants" ? experiences.filter((experience) => experience.participantCount > 0).map((experience) =>
                record(`participants-${experience.id}`, experience.title, `${formatDate(experience.date)} · ${experience.city}`, `${experience.participantCount} ${experience.participantCount === 1 ? "entry" : "entries"}`, `${experience.waitlistCount} waitlisted · people can count in more than one experience`)
              ) : experiences.map((experience) =>
                record(`experience-${experience.id}`, experience.title, `${formatDate(experience.date)} · ${experience.city}`, statusLabel(experience.status), `${experience.participantCount} ${experience.participantCount === 1 ? "participant entry" : "participant entries"} · ${experience.waitlistCount} waitlisted`)
              )
            ) : metric === "rewarded" ? (
              <>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, paddingVertical: 8 }}>
                  Showing distinct recipients from loaded payout history. This list may be partial; only payouts verified as paid are included.
                </Text>
                {!paidRecipients.size ? state("award", "No paid recipients in this page", "Only payouts verified as paid count here. Older payout pages may contain additional recipients.") : null}
                {[...paidRecipients.entries()].map(([recipientId, payout]) =>
                  record(`recipient-${recipientId}`, payout.recipientName, `Paid ${formatDate(payout.paidAt)} · verified on chain`, `${payout.amountSol} SOL`, payout.reason)
                )}
                {hasMorePayouts ? (
                  <Pressable testID="treasury-metric-load-more-payouts" accessibilityRole="button" disabled={payoutsFetching} onPress={onLoadMorePayouts} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    {payoutsFetching ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="chevron-down" size={15} color={colors.primary} />}
                    <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>{payoutsFetching ? "Loading older payouts…" : "Load older payout history"}</Text>
                  </Pressable>
                ) : payouts?.length === 50 ? <Text style={{ color: colors.mutedForeground, fontSize: 11, paddingVertical: 10, textAlign: "center" }}>No further payout page is available.</Text> : null}
              </>
            ) : noRows ? state(metric === "raised" ? "trending-up" : metric === "participants" ? "users" : metric === "experiences" ? "calendar" : "award", "No records to show yet", metric === "raised" ? "Campaign records will appear here when funds have verified contributions." : metric === "participants" ? "Participant entries will appear here as people join hosted experiences." : metric === "experiences" ? "Experiences owned by your organisation will appear here." : "Verified paid recipients will appear here when payout history is available.") : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FundCard({ fund }: { fund: OrganisationFund }) {
  const colors = useColors();
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [trackerExpanded, setTrackerExpanded] = useState(false);
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, overflow: "hidden" }}>
      <View style={{ padding: 15, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text style={{ color: colors.foreground, fontSize: 19, lineHeight: 25, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="briefcase" size={13} color={colors.mutedForeground} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{fund.organisationName}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: `${colors.primary}12`, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Feather name="target" size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Goal · {fund.goalSol.toLocaleString()} SOL</Text>
          </View>
        </View>

        <View style={{ gap: 3 }}>
          <Text numberOfLines={descriptionExpanded ? undefined : 3} style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{fund.description}</Text>
          {fund.description.length > 150 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={descriptionExpanded ? "Show less campaign information" : "Read full campaign information"}
              accessibilityState={{ expanded: descriptionExpanded }}
              testID={`fund-description-toggle-${fund.id}`}
              onPress={() => setDescriptionExpanded((expanded) => !expanded)}
              style={{ minHeight: 44, alignSelf: "flex-start", justifyContent: "center" }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{descriptionExpanded ? "Show less" : "Read more"}</Text>
            </Pressable>
          ) : null}
        </View>

        <FundStats fund={fund} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={trackerExpanded ? "Hide campaign tracker" : "View campaign tracker"}
          accessibilityState={{ expanded: trackerExpanded }}
          testID={`fund-tracker-toggle-${fund.id}`}
          onPress={() => setTrackerExpanded((expanded) => !expanded)}
          style={{ minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.primary + "35", borderRadius: colors.radius - 5, backgroundColor: colors.primary + "08", paddingHorizontal: 12 }}
        >
          <Feather name={trackerExpanded ? "chevron-up" : "bar-chart-2"} size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>{trackerExpanded ? "Hide campaign tracker" : "View campaign tracker"}</Text>
        </Pressable>
        {trackerExpanded ? <CampaignTrackerInsights fund={fund} showProgress={false} /> : null}
        <ContributeToFund fund={fund} />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="shield" size={13} color={colors.mutedForeground} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
              Shared charity treasury · Solana {fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${fund.organisationName} treasury address on Solana ${fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}`}
              testID={`fund-treasury-share-${fund.id}`}
              onPress={() => {
                void Share.share({ message: `${fund.organisationName} shared charity treasury\nSolana ${fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}\n${fund.walletAddress}` })
                  .catch(() => Alert.alert("Unable to share treasury address", "You can select and copy the address below."));
              }}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="share" size={15} color={colors.primary} />
            </Pressable>
          </View>
          <Text selectable style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15, fontFamily: "Inter_500Medium" }}>{fund.walletAddress}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>
            Approve in your wallet. Contributions are verified on chain before they count; confirmed transfers can’t be reversed.
          </Text>
        </View>
      </View>
    </View>
  );
}

export function OrganisationFundraiserSection({
  organisationUserId,
  canLaunch = false,
  onLaunch,
}: {
  organisationUserId: number;
  canLaunch?: boolean;
  onLaunch?: () => void;
}) {
  const colors = useColors();
  const query = useListOrganisationFunds(organisationUserId, {
    query: { queryKey: getListOrganisationFundsQueryKey(organisationUserId), enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0 },
  });
  if (query.isLoading && !canLaunch) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading fundraisers" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading fundraisers…</Text>
      </View>
    );
  }
  if (query.isError && !query.data?.length && !canLaunch) {
    return (
      <View style={{ marginVertical: 12, gap: 7 }}>
        <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12 }}>Fundraisers could not be loaded.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry loading fundraisers" onPress={() => { void query.refetch(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!query.isLoading && !query.isError && !query.data?.length && !canLaunch) return null;
  return (
    <View style={{ gap: 12, marginTop: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>{canLaunch ? "Your fundraisers" : "Support their work"}</Text>
          {query.data?.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{query.data.length} {query.data.length === 1 ? "campaign" : "campaigns"}</Text> : null}
        </View>
        {canLaunch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Launch a charity fund"
            testID="launch-charity-fund"
            onPress={onLaunch}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8 }}
          >
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Launch fund</Text>
          </Pressable>
        ) : null}
      </View>
      {query.isLoading ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading fundraisers" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Loading fundraisers…</Text>
        </View>
      ) : null}
      {query.isError ? (
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>Fundraisers could not be loaded.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading fundraisers" onPress={() => { void query.refetch(); }} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {query.data?.map((fund) => <FundCard key={fund.id} fund={fund} />)}
      {!query.isLoading && !query.isError && !query.data?.length && canLaunch ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>No active funds yet. Set up the charity treasury to invite SOL donations.</Text>
      ) : null}
    </View>
  );
}

export function OrganisationFundsScreen({
  organisationUserId,
  onBack,
  onOpenCampaign,
  initialView = "treasury",
  initialExperienceId,
  initialExperienceTitle,
  initialFundId,
}: {
  organisationUserId: number;
  onBack: () => void;
  onOpenCampaign?: (fundId?: number) => void;
  initialView?: "treasury" | "campaigns";
  initialExperienceId?: number;
  initialExperienceTitle?: string;
  initialFundId?: number;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalSol, setGoalSol] = useState("");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [treasuryAddress, setTreasuryAddress] = useState("");
  const [cluster, setCluster] = useState<OrganisationTreasuryInput["cluster"]>("mainnet-beta");
  const [before, setBefore] = useState<string | undefined>();
  const [loadedTransactions, setLoadedTransactions] = useState<OrganisationTreasuryDashboard["transactions"]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [stage, setStage] = useState<"dashboard" | "campaigns" | "create" | "success" | "detail">(
    initialView === "campaigns" ? (initialFundId ? "detail" : "campaigns") : (initialExperienceId ? "create" : "dashboard"),
  );
  const [createdFund, setCreatedFund] = useState<OrganisationFund | null>(null);
  const [selectedFund, setSelectedFund] = useState<OrganisationFund | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [payoutBefore, setPayoutBefore] = useState<string | undefined>();
  const [loadedPayoutRecords, setLoadedPayoutRecords] = useState<FundPayout[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<"active" | "all" | "closed">("active");
  const [experienceIdToAttach, setExperienceIdToAttach] = useState<number | undefined>(initialExperienceId);
  const { user } = useAuth();
  const hostOverviewQuery = useGetHostOverview({
    query: {
      queryKey: getGetHostOverviewQueryKey(),
      enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0,
    },
  });
  const treasuryQuery = useGetOrganisationTreasury({ limit: 20, before }, {
    query: {
      queryKey: getGetOrganisationTreasuryQueryKey({ limit: 20, before }),
      staleTime: 15_000,
      retry: false,
    },
  });
  const fundsQuery = useListOrganisationFunds(organisationUserId, {
    query: {
      queryKey: getListOrganisationFundsQueryKey(organisationUserId),
      enabled: Number.isSafeInteger(organisationUserId) && organisationUserId > 0,
    },
  });
  const hostedExperiencesQuery = useListHostExperiences({
    query: {
      queryKey: getListHostExperiencesQueryKey(),
      enabled: expandedMetric === "participants" || expandedMetric === "experiences",
    },
  });
  const payoutParams = payoutBefore ? { before: payoutBefore } : undefined;
  const payoutsQuery = useListFundPayouts(payoutParams, {
    query: {
      queryKey: [...getListFundPayoutsQueryKey(payoutParams), user?.id ?? "anon"],
      enabled: expandedMetric === "rewarded" && !!user,
      staleTime: 0,
    },
  });
  useEffect(() => {
    const page = payoutsQuery.data ?? [];
    if (expandedMetric !== "rewarded" || !page.length) return;
    setLoadedPayoutRecords((previous) => {
      const ids = new Set(previous.map((item) => item.id));
      return [...previous, ...page.filter((item) => !ids.has(item.id))];
    });
  }, [payoutsQuery.data, expandedMetric]);
  const selectedFundFromRoute = initialFundId ? fundsQuery.data?.find((fund) => fund.id === initialFundId) : undefined;
  const register = useRegisterOrganisationTreasury();
  const create = useCreateOrganisationFund({ mutation: { onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
  } } });
  const field = (label: string, value: string, setValue: (next: string) => void, placeholder: string, multiline = false) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => { setValue(next); setError(null); }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        accessibilityLabel={label}
        style={{ minHeight: multiline ? 112 : 50, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius - 6, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, backgroundColor: colors.card, textAlignVertical: multiline ? "top" : "center" }}
      />
    </View>
  );
  const button = (label: string, action: () => void, secondary = false, disabled = false, icon?: keyof typeof Feather.glyphMap, compact = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={{ minHeight: compact ? 44 : 50, borderRadius: colors.radius - 4, paddingHorizontal: compact ? 12 : 16, backgroundColor: secondary ? colors.card : colors.primary, borderWidth: secondary ? 1 : 0, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: compact ? 6 : 8, opacity: disabled ? 0.55 : 1 }}
    >
      {icon ? <Feather name={icon} size={compact ? 14 : 16} color={secondary ? colors.foreground : colors.primaryForeground} /> : null}
      <Text style={{ color: secondary ? colors.foreground : colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: compact ? 13 : 14 }}>{label}</Text>
    </Pressable>
  );
  const header = (titleText: string, subtitle: string, backAction: () => void, backLabel: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={backAction} style={{ width: 40, height: 40, justifyContent: "center" }}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.foreground, fontSize: 21, fontFamily: "Inter_700Bold" }}>{titleText}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{subtitle}</Text>
      </View>
    </View>
  );
  const allTransactions = [...loadedTransactions, ...(treasuryQuery.data?.transactions ?? [])];
  const visibleTransactions = activityExpanded ? allTransactions : allTransactions.slice(0, 5);
  const totalCampaignRaisedSol = fundsQuery.data?.reduce(
    (total, fund) => total + Number(fund.raisedSol || 0),
    0,
  );
  const totalCampaignRaisedLabel = totalCampaignRaisedSol === undefined
    ? "—"
    : `${formatCampaignSol(totalCampaignRaisedSol)} SOL`;
  const returnToStage = initialView === "campaigns" ? "campaigns" : "dashboard";

  const copyTreasuryAddress = async () => {
    const address = treasuryQuery.data?.treasury.walletAddress;
    if (!address) return;
    try {
      await Clipboard.setStringAsync(address);
      Alert.alert("Address copied", "The shared treasury address is ready to paste.");
    } catch {
      void Share.share({ message: `Send SOL to the charity treasury: ${address}` });
    }
  };
  const showTreasuryActionInfo = (action: "send" | "swap") => {
    if (action === "send") {
      Alert.alert(
        "Treasury transfers require approval",
        "Transfers from the shared charity treasury must be proposed and approved by its multisig signers. Experiences.fun never signs or sends treasury transactions.",
      );
      return;
    }
    Alert.alert(
      "Swaps are not available here",
      "Experiences.fun does not connect to or sign treasury swaps. The charity's multisig signers control the shared wallet.",
    );
  };

  if (stage === "detail" && initialFundId && fundsQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Loading verified campaign progress…", onBack, "Back to campaign tracker")}
        <View accessibilityRole="progressbar" style={{ padding: 20 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }
  if (stage === "detail" && initialFundId && fundsQuery.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Campaign progress could not be loaded.", onBack, "Back to campaign tracker")}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19 }}>We couldn’t verify this campaign right now.</Text>
          {button("Try again", () => { void fundsQuery.refetch(); }, true, false, "refresh-cw")}
          {button("Back to campaigns", onBack, true, false, "arrow-left")}
        </View>
      </View>
    );
  }
  if (stage === "detail" && initialFundId && !fundsQuery.isLoading && !fundsQuery.isError && !selectedFundFromRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "This campaign is not available.", onBack, "Back to campaign tracker")}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>It may have been removed or may belong to another charity.</Text>
          {button("Back to campaigns", onBack, true, false, "arrow-left")}
        </View>
      </View>
    );
  }

  if (stage === "success" && createdFund) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Fund created", "Your campaign is live and ready to share.", () => setStage(returnToStage), "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 34, gap: 18 }}>
          <View style={{ alignItems: "center", paddingVertical: 26, gap: 12 }}>
            <View style={{ width: 74, height: 74, borderRadius: 28, backgroundColor: colors.primary + "16", alignItems: "center", justifyContent: "center" }}>
              <Feather name="check" size={34} color={colors.primary} />
            </View>
            <Text style={{ color: colors.foreground, fontSize: 27, fontFamily: "Inter_700Bold", textAlign: "center" }}>Fund created!</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: "center" }}>Your campaign is now live and will receive donations at your charity treasury address.</Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 16, gap: 9 }}>
            <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" }}>{createdFund.title}</Text>
            {createdFund.experienceTitle ? <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>For {createdFund.experienceTitle}</Text> : null}
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>{createdFund.description}</Text>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Goal · {createdFund.goalSol.toLocaleString()} SOL</Text>
          </View>
          {button("View fund", () => { setSelectedFund(createdFund); setStage("detail"); }, false, false, "arrow-right")}
          {button("Share fund", () => {
            void Share.share({ message: `${createdFund.title}\n\n${createdFund.description}\n\nGoal: ${createdFund.goalSol.toLocaleString()} SOL\nDonate to the charity treasury: ${createdFund.walletAddress}` });
          }, true, false, "share-2")}
          {button(initialView === "campaigns" ? "Back to campaign tracker" : "Back to funds dashboard", () => setStage(returnToStage), true)}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "create") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Launch a fund", "Create a new campaign for your community.", () => { setError(null); setStage(returnToStage); }, "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 34, gap: 17 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
          <View style={{ borderRadius: colors.radius, backgroundColor: colors.primary + "10", padding: 14, flexDirection: "row", gap: 10 }}>
            <Feather name="info" size={17} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Donations go to your registered shared charity treasury. Experiences.fun never holds funds or controls wallet keys.</Text>
          </View>
          {!treasuryQuery.data ? (
            <View style={{ gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius, padding: 15 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Connect the charity treasury first</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Campaigns use the charity’s shared treasury. Register its public wallet address before launching this raise.</Text>
              {button("Set up treasury", () => { setStage("dashboard"); }, true, false, "arrow-left")}
            </View>
          ) : (
            <>
          {experienceIdToAttach ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: colors.radius - 4, backgroundColor: colors.primary + "10", padding: 12 }}>
              <Feather name="calendar" size={15} color={colors.primary} />
              <Text numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>This fundraiser will be attached to {initialExperienceTitle || "your selected Experience"}.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove Experience from fundraiser" onPress={() => setExperienceIdToAttach(undefined)} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          {field("Fund name", title, setTitle, "e.g. Community garden supplies")}
          {field("Short description", description, setDescription, "Explain what donations will support; list outcomes on separate lines.", true)}
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: -10 }}>Each non-empty line appears as a separate campaign detail. Use organizer-provided facts only.</Text>
          {field("Goal amount (SOL)", goalSol, setGoalSol, "e.g. 10")}
          {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, lineHeight: 18 }}>{error}</Text> : null}
          {button(create.isPending ? "Creating fund…" : "Create fund", () => {
            const goal = Number(goalSol);
            if (!title.trim() || title.trim().length < 3 || !description.trim() || description.trim().length < 10 || !Number.isFinite(goal) || goal <= 0 || Number(goal.toFixed(9)) !== goal) {
              setError("Add a fund name, a description of at least 10 characters, and a positive SOL goal (up to 9 decimal places).");
              return;
            }
            setError(null);
             void create.mutateAsync({ data: { title: title.trim(), description: description.trim(), goalSol: goal, ...(experienceIdToAttach ? { experienceId: experienceIdToAttach } : {}) } })
              .then((fund) => {
                setCreatedFund(fund);
                setSelectedFund(fund);
                setTitle("");
                setDescription("");
                setGoalSol("");
                setStage("success");
              })
              .catch((cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The fund could not be launched. Please try again."));
          }, false, create.isPending || !treasuryQuery.data, "arrow-right")}
            </>
          )}
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "campaigns") {
    const campaigns = fundsQuery.data ?? [];
    const visibleCampaigns = campaigns.filter((fund) => campaignFilter === "all" || fund.status === campaignFilter);
    const activeCount = campaigns.filter((fund) => fund.status === "active").length;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Follow verified fundraiser progress.", onBack, "Back to treasury")}
        <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 34, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Campaigns</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{activeCount} active · {campaigns.length} total</Text>
            </View>
            {button("Launch a fund", () => { setError(null); setStage("create"); }, false, false, "plus", true)}
          </View>
          <View style={{ flexDirection: "row", gap: 7 }}>
            {(["active", "all", "closed"] as const).map((filter) => (
              <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: campaignFilter === filter }} testID={`campaign-filter-${filter}`} onPress={() => setCampaignFilter(filter)} style={{ flex: 1, minHeight: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: campaignFilter === filter ? colors.primary : colors.card, borderWidth: 1, borderColor: campaignFilter === filter ? colors.primary : colors.border }}>
                <Text style={{ color: campaignFilter === filter ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{filter}</Text>
              </Pressable>
            ))}
          </View>
          {fundsQuery.isLoading ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 14 }}>Loading campaign progress…</Text> : fundsQuery.isError ? (
            <View style={{ gap: 9 }}>
              <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>Campaign progress could not be loaded.</Text>
              {button("Try again", () => { void fundsQuery.refetch(); }, true, fundsQuery.isFetching, "refresh-cw")}
            </View>
          ) : visibleCampaigns.length ? visibleCampaigns.map((fund) => (
            <CampaignProgressCard key={fund.id} fund={fund} onPress={() => { setSelectedFund(fund); setStage("detail"); }} />
          )) : (
            <View style={{ alignItems: "center", paddingVertical: 22, paddingHorizontal: 18, gap: 8 }}>
              <Feather name="target" size={25} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>{campaignFilter === "active" ? "No active campaigns" : campaignFilter === "closed" ? "No closed campaigns" : "No campaigns yet"}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Launch a fundraiser when your organisation is ready to raise support.</Text>
              {campaignFilter !== "active" ? null : button("Launch a fund", () => { setError(null); setStage("create"); }, false, false, "plus", true)}
            </View>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>Progress includes recorded, finalized campaign deposits only. Transfers to the shared treasury may not be attributable to a campaign.</Text>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  if (stage === "detail" && (selectedFund || selectedFundFromRoute)) {
    const activeSelectedFund = selectedFund ?? selectedFundFromRoute!;
    const fund = fundsQuery.data?.find((row) => row.id === activeSelectedFund.id) ?? activeSelectedFund;
    const launchedDate = transactionDateLabel(fund.createdAt);
    const sharedTreasury = treasuryQuery.data?.treasury.walletAddress === fund.walletAddress
      && treasuryQuery.data.treasury.cluster === fund.cluster
      ? treasuryQuery.data
      : undefined;
    const shareFund = () => Share.share({
      message: `${fund.title}\n\n${fund.description}\n\nCampaign goal: ${fund.goalSol.toLocaleString()} SOL\n\nContributions are sent to ${fund.organisationName}'s shared charity treasury. On-chain transfers may not be attributable to this specific fund.\n\nTreasury: ${fund.walletAddress}`,
    });
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header("Campaign tracker", "Verified progress and campaign details", () => onOpenCampaign ? onOpenCampaign(fund.id) : setStage("campaigns"), "Back to campaign tracker")}
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={60}
        >
          <View style={{ borderRadius: colors.radius + 5, overflow: "hidden", backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "24", padding: 18, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: fund.status.toLowerCase() === "active" ? colors.success : colors.mutedForeground }} />
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6 }}>{fund.status.toUpperCase()}</Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Campaign #{fund.id}</Text>
            </View>
            <View style={{ gap: 7 }}>
              <Text style={{ color: colors.foreground, fontSize: 25, lineHeight: 31, fontFamily: "Inter_700Bold" }}>{fund.title}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Feather name="briefcase" size={14} color={colors.primary} />
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{fund.organisationName}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: colors.card, paddingHorizontal: 9, paddingVertical: 7 }}>
                <Feather name="target" size={12} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Goal · {fund.goalSol.toLocaleString()} SOL</Text>
              </View>
              {launchedDate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: colors.card, paddingHorizontal: 9, paddingVertical: 7 }}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Started {launchedDate}</Text>
                </View>
              ) : null}
            </View>
            {fund.experienceTitle ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 9 }}>
                <Feather name="calendar" size={13} color={colors.primary} />
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Supporting {fund.experienceTitle}</Text>
              </View>
            ) : null}
          </View>

          <CampaignTrackerInsights fund={fund} />

          <View style={{ borderWidth: 1, borderColor: colors.primary + "30", backgroundColor: colors.primary + "08", borderRadius: colors.radius + 3, padding: 15, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + "16", alignItems: "center", justifyContent: "center" }}>
                <Feather name="shield" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_700Bold" }}>One shared charity treasury</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Your transfer goes to the organisation, not a campaign-specific wallet.</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: colors.primary + "20", paddingTop: 10, gap: 6 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.6 }}>TREASURY ADDRESS</Text>
              <Text selectable style={{ color: colors.foreground, fontSize: 11, lineHeight: 17, fontFamily: "Inter_600SemiBold" }}>{fund.walletAddress}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Solana · {fund.cluster === "mainnet-beta" ? "Mainnet" : fund.cluster}</Text>
              {sharedTreasury ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: 1, borderTopColor: colors.primary + "20", paddingTop: 9 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }}>SHARED TREASURY BALANCE</Text>
                    <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>{sharedTreasury.balanceSol} SOL</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>Checked {transactionDateLabel(sharedTreasury.checkedAt) ?? "recently"}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={treasuryQuery.isFetching ? "Refreshing shared treasury balance" : "Refresh shared treasury balance"}
                    testID={`fund-detail-refresh-treasury-${fund.id}`}
                    disabled={treasuryQuery.isFetching}
                    onPress={() => { void treasuryQuery.refetch(); }}
                    style={{ minHeight: 40, minWidth: 40, alignItems: "center", justifyContent: "center", opacity: treasuryQuery.isFetching ? 0.55 : 1 }}
                  >
                    <Feather name="refresh-cw" size={15} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Raised totals count only verified payment requests and recorded deposits. Funds share one treasury, so other transfers may not be attributable to this fund.</Text>
          </View>

          <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 3, padding: 15, gap: 12 }}>
            <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Make a contribution</Text>
            <ContributeToFund fund={fund} />
          </View>
          <FundOwnerControls key={fund.id} fund={fund} onUpdated={(updated) => {
            setSelectedFund(updated);
            queryClient.setQueryData<OrganisationFund[]>(getListOrganisationFundsQueryKey(organisationUserId), (current) =>
              current?.map((row) => row.id === updated.id ? updated : row));
          }} />

          <View style={{ flexDirection: "row", gap: 9 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open shared charity treasury on Solscan"
              testID={`fund-detail-solscan-${fund.id}`}
              onPress={() => {
                void Linking.openURL(solscanUrl(`account/${fund.walletAddress}`, fund.cluster)).catch(() => {
                  Alert.alert("Unable to open Solscan", "Check your connection and try again.");
                });
              }}
              style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: colors.radius - 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 8 }}
            >
              <Feather name="external-link" size={15} color={colors.foreground} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Solscan</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${fund.title}`}
              testID={`fund-detail-share-${fund.id}`}
              onPress={() => { void shareFund(); }}
              style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: colors.radius - 5, backgroundColor: colors.primary, paddingHorizontal: 8 }}
            >
              <Feather name="share-2" size={15} color={colors.primaryForeground} />
              <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Share fund</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to organisation profile"
          testID="treasury-back"
          onPress={onBack}
          style={{ width: 34, height: 30, justifyContent: "center" }}
        >
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 34, marginTop: 16 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ color: colors.foreground, fontSize: 20, lineHeight: 24, fontFamily: "Inter_700Bold" }}>Charity treasury</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>
              Selected funds, campaign progress and community impact.
            </Text>
          </View>
          {treasuryQuery.data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Treasury network: Solana ${treasuryQuery.data.treasury.cluster === "mainnet-beta" ? "Mainnet" : treasuryQuery.data.treasury.cluster}`}
              testID="treasury-network-info"
              onPress={() => {
                const network = treasuryQuery.data!.treasury.cluster === "mainnet-beta"
                  ? "Mainnet"
                  : treasuryQuery.data!.treasury.cluster;
                Alert.alert("Treasury network", `This shared treasury is registered on Solana ${network}.`);
              }}
              style={{ minHeight: 34, maxWidth: 156, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card, paddingHorizontal: 9 }}
            >
              <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.foreground, alignItems: "center", justifyContent: "center", gap: 1 }}>
                <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: colors.teal, transform: [{ skewX: "-20deg" }] }} />
                <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: colors.secondary, transform: [{ skewX: "-20deg" }] }} />
                <View style={{ width: 9, height: 2, borderRadius: 1, backgroundColor: colors.primary, transform: [{ skewX: "-20deg" }] }} />
              </View>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.foreground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                Solana · {treasuryQuery.data.treasury.cluster === "mainnet-beta" ? "Mainnet" : treasuryQuery.data.treasury.cluster}
              </Text>
              <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <KeyboardAwareScrollViewCompat style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bottomOffset={60}>
        {treasuryQuery.isLoading ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 16 }}>Loading charity treasury…</Text>
        ) : treasuryQuery.isError && (treasuryQuery.error as { status?: number })?.status !== 404 ? (
          <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 17 }}>
            <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19 }}>Your charity treasury could not be loaded. You can retry without changing your saved treasury.</Text>
            {button("Try again", () => { void treasuryQuery.refetch(); }, true, treasuryQuery.isFetching, "refresh-cw")}
          </View>
        ) : treasuryQuery.data ? (
          <>
            <View
              testID="treasury-hero-card"
              style={{ position: "relative", overflow: "hidden", borderWidth: 1, borderColor: colors.primary + "20", borderRadius: 24, backgroundColor: colors.primary + "0A" }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[colors.primary + "0A", colors.primary + "17", colors.secondary + "08"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={{ position: "absolute", width: 148, height: 148, right: -26, top: 20, borderRadius: 74, backgroundColor: colors.primary + "0D" }} />
              <Image
                source={require("../assets/images/charity-treasury-wallet.png")}
                resizeMode="contain"
                accessible={false}
                testID="treasury-hero-artwork"
                style={{ position: "absolute", right: -20, top: 17, width: 208, height: 164, zIndex: 0 }}
              />
              <View style={{ position: "relative", zIndex: 1, padding: 14, gap: 9 }}>
                <View style={{ minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.card + "B8", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="shield" size={17} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.55 }}>SHARED TREASURY</Text>
                    <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 10 }}>Collective funds for real-world impact.</Text>
                  </View>
                </View>

                <View style={{ width: "65%", gap: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.foreground, fontSize: 11 }}>Available balance</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={balanceVisible ? "Hide treasury balance" : "Show treasury balance"}
                      accessibilityState={{ selected: !balanceVisible }}
                      testID="treasury-balance-visibility"
                      onPress={() => setBalanceVisible((visible) => !visible)}
                      hitSlop={8}
                    >
                      <Feather name={balanceVisible ? "eye" : "eye-off"} size={13} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 5 }}>
                    <Text
                      accessibilityLabel={balanceVisible ? `Treasury balance ${treasuryQuery.data.balanceSol} SOL` : "Treasury balance hidden"}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      style={{ maxWidth: "100%", color: colors.foreground, fontSize: 34, lineHeight: 39, fontFamily: "Inter_700Bold", letterSpacing: -1 }}
                    >
                      {balanceVisible ? treasuryQuery.data.balanceSol : "••••••••"}
                    </Text>
                    <Text style={{ color: colors.primary, fontSize: 19, lineHeight: 25, fontFamily: "Inter_700Bold" }}>SOL</Text>
                  </View>
                </View>

                <View style={{ width: "60%", flexDirection: "row", gap: 9 }}>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 31, height: 31, borderRadius: 11, backgroundColor: colors.teal + "15", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="activity" size={14} color={colors.teal} />
                    </View>
                    <View style={{ minWidth: 0, gap: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_700Bold" }}>—</Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 9 }}>24H CHANGE</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 31, height: 31, borderRadius: 11, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}>
                      <Feather name="bar-chart-2" size={14} color={colors.primary} />
                    </View>
                    <View style={{ minWidth: 0, gap: 1 }}>
                      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_700Bold" }}>{totalCampaignRaisedLabel}</Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 9 }}>CAMPAIGN RAISED</Text>
                    </View>
                  </View>
                </View>

                <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: colors.card + "E8", paddingHorizontal: 12 }}>
                  <Feather name="key" size={13} color={colors.mutedForeground} />
                  <Text
                    selectable
                    numberOfLines={1}
                    accessibilityLabel={`Treasury wallet address ${treasuryQuery.data.treasury.walletAddress}`}
                    style={{ flex: 1, color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}
                  >
                    {shortAddress(treasuryQuery.data.treasury.walletAddress)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy treasury address"
                    testID="treasury-address-copy"
                    onPress={() => { void copyTreasuryAddress(); }}
                    style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                    hitSlop={8}
                  >
                    <Feather name="copy" size={15} color={colors.foreground} />
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Open charity treasury on Solscan"
                    testID="treasury-solscan"
                    onPress={() => {
                      void Linking.openURL(solscanUrl(`account/${treasuryQuery.data!.treasury.walletAddress}`, treasuryQuery.data!.treasury.cluster)).catch(() => {
                        Alert.alert("Unable to open Solscan", "Check your connection and try again.");
                      });
                    }}
                    style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.primary + "20", borderRadius: 14, backgroundColor: colors.card + "D9" }}
                  >
                    <Feather name="external-link" size={15} color={colors.foreground} />
                    <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Solscan</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Share treasury address to receive SOL"
                    testID="treasury-receive"
                    onPress={() => {
                      void Share.share({ message: `Send SOL to the charity treasury: ${treasuryQuery.data!.treasury.walletAddress}` });
                    }}
                    style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: colors.primary }}
                  >
                    <Feather name="share-2" size={15} color={colors.primaryForeground} />
                    <Text style={{ color: colors.primaryForeground, fontSize: 12, fontFamily: "Inter_700Bold" }}>Receive SOL</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    { label: "Send", icon: "arrow-up" as const, action: () => showTreasuryActionInfo("send"), testID: "treasury-send" },
                    { label: "Swap", icon: "repeat" as const, action: () => showTreasuryActionInfo("swap"), testID: "treasury-swap" },
                    { label: treasuryQuery.isFetching ? "Refreshing" : "Refresh", icon: "refresh-cw" as const, action: () => { void treasuryQuery.refetch(); }, testID: "treasury-refresh" },
                  ]).map(({ label, icon, action, testID }) => (
                    <Pressable
                      key={testID}
                      accessibilityRole="button"
                      accessibilityLabel={testID === "treasury-refresh" ? "Refresh treasury balance and activity" : `${label} treasury`}
                      accessibilityState={{ disabled: testID === "treasury-refresh" && treasuryQuery.isFetching }}
                      testID={testID}
                      disabled={testID === "treasury-refresh" && treasuryQuery.isFetching}
                      onPress={action}
                      style={({ pressed }) => ({ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 16, backgroundColor: colors.card + "A8", opacity: pressed || (testID === "treasury-refresh" && treasuryQuery.isFetching) ? 0.6 : 1 })}
                    >
                      {testID === "treasury-refresh" && treasuryQuery.isFetching
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Feather name={icon} size={16} color={colors.primary} />}
                      <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 1 }}>
                  <Feather name="info" size={12} color={colors.mutedForeground} />
                  <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 10, lineHeight: 14 }}>
                    This is a shared treasury for your organisation and community.
                  </Text>
                </View>
              </View>
            </View>
            <View style={{ gap: 9 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" }}>Community impact</Text>
                <Pressable
                  testID="treasury-impact-all-time"
                  accessibilityRole="button"
                  accessibilityLabel="All-time community impact metrics"
                  onPress={() => Alert.alert("All-time totals", "These figures show all recorded activity; time-range filters are not available yet.")}
                  style={{ minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card, paddingHorizontal: 10 }}
                >
                  <Feather name="calendar" size={13} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>All time</Text>
                  <Feather name="chevron-down" size={13} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
                <ExpandableMetric label="CAMPAIGN RAISED" accessibilityLabel={`Campaign raised: ${totalCampaignRaisedLabel}`} value={totalCampaignRaisedLabel} icon="trending-up" expanded={expandedMetric === "raised"} onPress={() => setExpandedMetric(expandedMetric === "raised" ? null : "raised")} />
                <ExpandableMetric label="PARTICIPANT ENTRIES" accessibilityLabel={`Participant entries: ${hostOverviewQuery.data?.participantCount.toLocaleString() ?? "unavailable"}`} value={hostOverviewQuery.data ? hostOverviewQuery.data.participantCount.toLocaleString() : "—"} icon="users" expanded={expandedMetric === "participants"} onPress={() => setExpandedMetric(expandedMetric === "participants" ? null : "participants")} />
                <ExpandableMetric label="EXPERIENCES" accessibilityLabel={`Experiences: ${hostOverviewQuery.data?.totalExperiences.toLocaleString() ?? "unavailable"}`} value={hostOverviewQuery.data ? hostOverviewQuery.data.totalExperiences.toLocaleString() : "—"} icon="calendar" expanded={expandedMetric === "experiences"} onPress={() => setExpandedMetric(expandedMetric === "experiences" ? null : "experiences")} />
                <ExpandableMetric label="REWARDED USERS" accessibilityLabel={`Rewarded users: ${hostOverviewQuery.data && Number.isFinite(hostOverviewQuery.data.rewardedUserCount) ? hostOverviewQuery.data.rewardedUserCount.toLocaleString() : "unavailable"}`} value={hostOverviewQuery.data && Number.isFinite(hostOverviewQuery.data.rewardedUserCount) ? hostOverviewQuery.data.rewardedUserCount.toLocaleString() : "—"} icon="award" expanded={expandedMetric === "rewarded"} onPress={() => {
                  if (expandedMetric === "rewarded") setExpandedMetric(null);
                  else {
                    setPayoutBefore(undefined);
                    setLoadedPayoutRecords([]);
                    setExpandedMetric("rewarded");
                  }
                }} />
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Active campaigns</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Fundraising can support an Experience, but it is optional.</Text>
                </View>
                {fundsQuery.data?.length ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{fundsQuery.data.filter((fund) => fund.status === "active").length} active</Text> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>{button("Launch a fund", () => { setExperienceIdToAttach(undefined); setError(null); setStage("create"); }, false, false, "plus", true)}</View>
                <View style={{ flex: 1 }}>{button("Track campaigns", () => onOpenCampaign ? onOpenCampaign() : setStage("campaigns"), true, false, "bar-chart-2")}</View>
              </View>
              {fundsQuery.isLoading ? <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 10 }}>Loading your campaigns…</Text> :
                fundsQuery.isError ? (
                  <View style={{ gap: 8 }}>
                    <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13 }}>Your funds could not be loaded.</Text>
                    {button("Try again", () => { void fundsQuery.refetch(); }, true)}
                  </View>
                ) : fundsQuery.data?.some((fund) => fund.status === "active") ? fundsQuery.data.filter((fund) => fund.status === "active").map((fund) => (
                  <CampaignProgressCard key={fund.id} fund={fund} onPress={() => onOpenCampaign ? onOpenCampaign(fund.id) : (setSelectedFund(fund), setStage("detail"))} />
                )) : (
                  <View style={{ alignItems: "center", paddingVertical: 20, paddingHorizontal: 18, gap: 8 }}>
                    <Feather name="heart" size={25} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>No active funds yet</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>Launch a campaign to invite your community to support your charity.</Text>
                  </View>
                )}
            </View>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Treasury activity</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Public on-chain activity · shared treasury</Text>
                </View>
                {allTransactions.length ? (
                  <View style={{ borderRadius: 20, backgroundColor: colors.muted, paddingHorizontal: 9, paddingVertical: 5 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{allTransactions.length} loaded</Text>
                  </View>
                ) : null}
              </View>
              {treasuryQuery.isError ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>Treasury activity could not be refreshed. Check your connection and try again.</Text> : null}
              {visibleTransactions.map((transaction) => {
                const attributedFund = transaction.status === "confirmed" && transaction.campaignId
                  ? fundsQuery.data?.find((fund) => fund.id === transaction.campaignId)
                  : undefined;
                const campaignLabel = attributedFund?.title ?? (transaction.campaignId ? `#${transaction.campaignId}` : null);
                return <TreasuryActivityEntry key={transaction.signature} transaction={transaction} cluster={treasuryQuery.data!.treasury.cluster} campaignLabel={campaignLabel} />;
              })}
              {!treasuryQuery.data.transactions.length && !loadedTransactions.length && !treasuryQuery.isError
                ? <View
                    testID="treasury-empty-activity"
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
                      backgroundColor: colors.primary + "0D",
                      borderWidth: 1,
                      borderColor: colors.primary + "18",
                    }}>
                      <Image
                        testID="treasury-empty-artwork"
                        source={require("../assets/images/charity-treasury-wallet.png")}
                        resizeMode="contain"
                        accessible={false}
                        style={{ width: 82, height: 66 }}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 13 }}>No incoming transfers yet</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Incoming transfers appear here once they’re visible on-chain.</Text>
                    </View>
                  </View>
                : null}
              {!activityExpanded && allTransactions.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setActivityExpanded(true)} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Show all loaded transfers</Text>
                  <Feather name="chevron-down" size={16} color={colors.primary} />
                </Pressable>
              ) : activityExpanded && allTransactions.length > 5 ? (
                <Pressable accessibilityRole="button" onPress={() => setActivityExpanded(false)} style={{ minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 7 }}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>Show recent only</Text>
                  <Feather name="chevron-up" size={16} color={colors.primary} />
                </Pressable>
              ) : null}
              {activityExpanded && treasuryQuery.data.hasMore ? <Pressable accessibilityRole="button" disabled={treasuryQuery.isFetching} onPress={() => {
                if (!treasuryQuery.data?.nextCursor) return;
                setLoadedTransactions((previous) => [...previous, ...treasuryQuery.data!.transactions]);
                setBefore(treasuryQuery.data.nextCursor);
              }} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>{treasuryQuery.isFetching ? "Loading…" : "Load older activity"}</Text></Pressable> : null}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.muted }}>
                <Feather name="shield" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>Campaign totals are separate from this shared wallet. Experiences.fun reads public activity only; it does not hold funds or control wallet keys.</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ gap: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius + 4, padding: 17 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary + "14", alignItems: "center", justifyContent: "center" }}><Feather name="shield" size={19} color={colors.primary} /></View>
            <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>Connect your charity treasury</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>Register your public Squads treasury address to receive donations and launch community funds. We verify the address is queryable, but cannot prove it belongs to Squads.</Text>
            {field("Treasury public address", treasuryAddress, setTreasuryAddress, "Paste your treasury address")}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Solana network</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["mainnet-beta", "devnet", "testnet"] as const).map((option) => (
                <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: cluster === option }} onPress={() => setCluster(option)} style={{ flex: 1, borderWidth: 1, borderColor: cluster === option ? colors.primary : colors.border, backgroundColor: cluster === option ? colors.primary : colors.card, borderRadius: colors.radius - 6, paddingVertical: 11, alignItems: "center" }}>
                  <Text style={{ color: cluster === option ? colors.primaryForeground : colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{option === "mainnet-beta" ? "Mainnet" : option}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text> : null}
            {button(register.isPending ? "Checking address…" : "Register treasury", () => {
              setError(null);
              if (!isValidSolanaAddress(treasuryAddress.trim())) {
                setError("Enter a valid Solana public address.");
                return;
              }
              register.mutate({ data: { walletAddress: treasuryAddress.trim(), cluster } }, {
                onSuccess: () => {
                  setTreasuryAddress("");
                  setBefore(undefined);
                  setLoadedTransactions([]);
                  void queryClient.invalidateQueries({ queryKey: getGetOrganisationTreasuryQueryKey() });
                  void queryClient.invalidateQueries({ queryKey: getListOrganisationFundsQueryKey(organisationUserId) });
                  if (initialExperienceId) {
                    setStage("create");
                  }
                },
                onError: (cause) => setError((cause as { data?: { message?: string } })?.data?.message ?? "The treasury could not be registered."),
              });
            }, false, register.isPending, "arrow-right")}
          </View>
        )}
        <CharityPayoutsSection funds={fundsQuery.data ?? []} />
      </KeyboardAwareScrollViewCompat>
      <TreasuryMetricDetailsSheet
        metric={expandedMetric as TreasuryMetric | null}
        overview={hostOverviewQuery.data}
        funds={fundsQuery.data}
        fundsLoading={fundsQuery.isLoading}
        fundsError={fundsQuery.isError}
        retryFunds={() => { void fundsQuery.refetch(); }}
        experiences={hostedExperiencesQuery.data}
        experiencesLoading={hostedExperiencesQuery.isLoading}
        experiencesError={hostedExperiencesQuery.isError}
        retryExperiences={() => { void hostedExperiencesQuery.refetch(); }}
        payouts={payoutsQuery.data}
        payoutsLoading={payoutsQuery.isLoading}
        payoutsError={payoutsQuery.isError}
        retryPayouts={() => { void payoutsQuery.refetch(); }}
        loadedPayouts={loadedPayoutRecords}
        hasMorePayouts={(payoutsQuery.data?.length ?? 0) >= 50}
        payoutsFetching={payoutsQuery.isFetching}
        onLoadMorePayouts={() => {
          const page = payoutsQuery.data ?? [];
          if (page.length < 50) return;
          setPayoutBefore(page[page.length - 1].id);
        }}
        onClose={() => setExpandedMetric(null)}
      />
    </View>
  );
}
