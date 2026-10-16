import { ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, Share, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { QueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

export type Cluster = "mainnet-beta" | "devnet" | "testnet";

export function clusterLabel(cluster: string) {
  return cluster === "mainnet-beta" ? "Mainnet" : cluster === "devnet" ? "Devnet (test)" : cluster === "testnet" ? "Testnet (test)" : cluster;
}

export function explorerUrl(kind: "tx" | "account", value: string, cluster: string) {
  return `https://solscan.io/${kind}/${value}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

export function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Turns a failed request into actionable copy; 503 means the backend migration is still pending. */
export function apiErrorMessage(error: unknown, fallback: string) {
  const e = error as { status?: number; data?: { message?: string } } | null;
  if (e?.status === 503) {
    return e.data?.message
      ? `${e.data.message} (service unavailable, try again shortly)`
      : "This service is temporarily unavailable. The fundraising database migration or the Solana RPC may be pending; wait a moment and retry.";
  }
  const message = e?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function refreshFundData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => typeof query.queryKey[0] === "string" && (query.queryKey[0] as string).startsWith("/api/funds"),
  });
}

export function openExternal(url: string, onFail?: () => void) {
  void Linking.openURL(url).catch(() => onFail?.());
}

export function shareText(message: string, onFail?: () => void) {
  void Share.share({ message }).catch(() => onFail?.());
}

export function Btn({
  label, onPress, icon, variant = "primary", disabled, busy, testID, danger,
}: {
  label: string; onPress: () => void; icon?: keyof typeof Feather.glyphMap; variant?: "primary" | "secondary"; disabled?: boolean; busy?: boolean; testID?: string; danger?: boolean;
}) {
  const colors = useColors();
  const primary = variant === "primary";
  const fg = primary ? colors.primaryForeground : danger ? colors.destructive : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      testID={testID}
      disabled={disabled || busy}
      onPress={onPress}
      style={{ minHeight: 48, borderRadius: colors.radius - 4, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: primary ? colors.primary : colors.card, borderWidth: primary ? 0 : 1, borderColor: danger ? colors.destructive + "55" : colors.border, opacity: disabled || busy ? 0.55 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Feather name={icon} size={15} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: "Inter_700Bold", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: "primary" | "warn" | "error" }) {
  const colors = useColors();
  const border = tone === "primary" ? colors.primary + "35" : tone === "error" ? colors.destructive + "40" : colors.border;
  const bg = tone === "primary" ? colors.primary + "0A" : tone === "error" ? colors.destructive + "0D" : colors.card;
  return <View style={{ borderWidth: 1, borderColor: border, backgroundColor: bg, borderRadius: colors.radius + 2, padding: 14, gap: 10 }}>{children}</View>;
}

export function Notice({ text, tone = "info", testID }: { text: string; tone?: "info" | "error" | "success"; testID?: string }) {
  const colors = useColors();
  const c = tone === "error" ? colors.destructive : tone === "success" ? colors.success : colors.primary;
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: colors.radius - 4, backgroundColor: c + "12", padding: 11 }}>
      <Feather name={tone === "error" ? "alert-circle" : tone === "success" ? "check-circle" : "info"} size={15} color={c} style={{ marginTop: 1 }} />
      <Text accessibilityRole={tone === "error" ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.foreground, fontSize: 12, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

export function NetworkBadge({ cluster }: { cluster: string }) {
  const colors = useColors();
  const main = cluster === "mainnet-beta";
  const c = main ? colors.destructive : colors.success;
  return (
    <View accessibilityLabel={main ? "Solana Mainnet, real money" : `Solana ${cluster}, test network, not real money`} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c + "16", borderWidth: 1, borderColor: c + "40" }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text style={{ color: c, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>{main ? "MAINNET · REAL SOL" : `TEST NETWORK · ${cluster.toUpperCase()}`}</Text>
    </View>
  );
}

export function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text selectable accessibilityLabel={`${label}: ${value}`} style={{ color: colors.foreground, fontSize: mono ? 11 : 13, lineHeight: 17, fontFamily: mono ? "Inter_600SemiBold" : "Inter_500Medium" }}>{value}</Text>
    </View>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 2 }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" }}>{title}</Text>
      {hint ? <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{hint}</Text> : null}
    </View>
  );
}

export function Skeleton({ height = 80 }: { height?: number }) {
  const colors = useColors();
  return <View accessibilityLabel="Loading" style={{ height, borderRadius: colors.radius, backgroundColor: colors.muted }} />;
}

export function EmptyBlock({ icon, title, body }: { icon: keyof typeof Feather.glyphMap; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", gap: 8, padding: 24, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: colors.radius }}>
      <Feather name={icon} size={24} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{title}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: "center" }}>{body}</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Notice tone="error" text={message} />
      <Btn variant="secondary" label="Try again" icon="refresh-cw" onPress={onRetry} />
    </View>
  );
}
