import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListCommunityMissionsQueryKey,
  getListQuestNotificationsQueryKey,
  useCreateCommunityMission,
  useJoinCommunityMission,
  useListCommunityMissions,
} from "@workspace/api-client-react";
import { PoppinsText as Text } from "@/components/Typography";
import { useColors } from "@/hooks/useColors";
import { QuestNotificationsPanel } from "@/components/SocialQuestsPanel";

export function CommunityMissionsPanel({
  chatId,
  communityTitle,
}: {
  chatId: string;
  communityTitle: string;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [targetCount, setTargetCount] = useState(10);
  const [notice, setNotice] = useState("");
  const missionsQuery = useListCommunityMissions({
    query: {
      queryKey: getListCommunityMissionsQueryKey(),
      refetchInterval: 20_000,
      retry: 1,
    },
  });
  const createMission = useCreateCommunityMission();
  const joinMission = useJoinCommunityMission();
  const missions = useMemo(
    () => (missionsQuery.data ?? []).filter((mission) => mission.chatId === chatId),
    [missionsQuery.data, chatId],
  );
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListCommunityMissionsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListQuestNotificationsQueryKey() }),
    ]);
  };
  const create = () => {
    if (createMission.isPending) return;
    setNotice("");
    createMission.mutate({
      data: {
        title: `${communityTitle} mission`.slice(0, 100),
        chatId,
        targetCount,
      },
    }, {
      onSuccess: async () => {
        setNotice("Mission created. Only eligible, recorded Telegram messages count.");
        await refresh();
      },
      onError: () => setNotice("Could not create a mission. A recorded contribution in this group is required."),
    });
  };

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.secondary + "12" }]}>
          <Feather name="message-circle" size={17} color={colors.secondary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.secondary }]}>GROUP CONTRIBUTIONS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Community missions</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Count positive, qualifying message awards from this group’s contribution ledger.
          </Text>
        </View>
      </View>

      <View style={[styles.createBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Text style={[styles.createTitle, { color: colors.foreground }]} numberOfLines={1}>
          {communityTitle} mission
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Choose a shared target. Mission recognition is separate from Community XP.
        </Text>
        <View style={styles.targetRow}>
          <Text style={[styles.targetLabel, { color: colors.foreground }]}>Qualifying messages</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reduce mission target"
              testID="community-mission-target-minus"
              onPress={() => setTargetCount((value) => Math.max(1, value - 5))}
              style={[styles.stepButton, { borderColor: colors.border }]}
            >
              <Feather name="minus" size={14} color={colors.primary} />
            </Pressable>
            <Text testID="community-mission-target" style={[styles.targetValue, { color: colors.foreground }]}>{targetCount}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase mission target"
              testID="community-mission-target-plus"
              onPress={() => setTargetCount((value) => Math.min(500, value + 5))}
              style={[styles.stepButton, { borderColor: colors.border }]}
            >
              <Feather name="plus" size={14} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          testID="community-mission-create"
          onPress={create}
          disabled={createMission.isPending}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: createMission.isPending ? 0.75 : 1 }]}
        >
          {createMission.isPending
            ? <ActivityIndicator size="small" color={colors.primaryForeground} />
            : <Feather name="flag" size={15} color={colors.primaryForeground} />}
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Start group mission</Text>
        </Pressable>
      </View>

      {!!notice && (
        <Text accessibilityRole="alert" style={[styles.notice, { color: notice.startsWith("Could not") ? colors.destructive : colors.success }]}>
          {notice}
        </Text>
      )}
      <Text style={[styles.listTitle, { color: colors.foreground }]}>Open and completed</Text>
      {missionsQuery.isLoading ? (
        <View style={styles.loading}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : missionsQuery.isError ? (
        <Text style={[styles.hint, { color: colors.destructive }]}>Missions could not load. Try again in a moment.</Text>
      ) : missions.length ? (
        missions.map((mission) => (
          <View key={mission.id} testID={`community-mission-${mission.id}`} style={[styles.missionCard, { borderColor: colors.border }]}>
            <View style={styles.missionHeader}>
              <Text style={[styles.missionTitle, { color: colors.foreground }]}>{mission.title}</Text>
              <Text style={[styles.missionStatus, { color: mission.status === "completed" ? colors.success : colors.primary }]}>
                {mission.status === "completed" ? "Complete" : `${mission.progress}/${mission.targetCount}`}
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {mission.progress} of {mission.targetCount} qualifying messages
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.progressFill, {
                backgroundColor: colors.primary,
                width: `${Math.min(100, (mission.progress / mission.targetCount) * 100)}%`,
              }]} />
            </View>
            {mission.participants.map((participant) => (
              <View key={participant.id} style={[styles.participantRow, { borderTopColor: colors.border }]}>
                <Feather
                  name={participant.rewardGrantedAt ? "award" : "user"}
                  size={14}
                  color={participant.rewardGrantedAt ? colors.success : colors.mutedForeground}
                />
                <Text style={[styles.participantName, { color: colors.foreground }]} numberOfLines={1}>
                  {participant.name}{participant.isViewer ? " · you" : ""}
                </Text>
                <Text style={[styles.participantCount, { color: colors.mutedForeground }]}>
                  {participant.contributionCount ?? 0}
                </Text>
              </View>
            ))}
            {mission.canJoin && (
              <Pressable
                accessibilityRole="button"
                testID={`community-mission-join-${mission.id}`}
                onPress={() => joinMission.mutate({ questId: mission.id }, {
                  onSuccess: refresh,
                  onError: () => setNotice("You need a qualifying contribution in this group to join."),
                })}
                disabled={joinMission.isPending}
                style={[styles.joinButton, { backgroundColor: colors.primary }]}
              >
                {joinMission.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="plus" size={15} color={colors.primaryForeground} />}
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Join mission</Text>
              </Pressable>
            )}
            {mission.joined && (
              <Text style={[styles.hint, { color: colors.success }]}>
                {mission.recognition ?? "You’re in. Your eligible ledger contributions count automatically."}
              </Text>
            )}
          </View>
        ))
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          No missions for this group yet. Start one above to coordinate contributions.
        </Text>
      )}
      <QuestNotificationsPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 20, padding: 14, marginTop: 14 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  title: { fontSize: 18, lineHeight: 23, fontFamily: "Inter_700Bold", marginTop: 3 },
  subtitle: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular", marginTop: 4 },
  createBox: { borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 13 },
  createTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", marginTop: 6 },
  targetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11 },
  targetLabel: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  targetValue: { minWidth: 24, textAlign: "center", fontSize: 14, fontFamily: "Inter_700Bold" },
  primaryButton: { minHeight: 43, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 10 },
  buttonText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  notice: { fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: "center" },
  listTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 4 },
  loading: { padding: 16, alignItems: "center" },
  missionCard: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 8 },
  missionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  missionTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold" },
  missionStatus: { fontSize: 10, fontFamily: "Inter_700Bold" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", borderRadius: 3 },
  participantRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 5, paddingTop: 5 },
  participantName: { flex: 1, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  participantCount: { fontSize: 10, fontFamily: "Inter_700Bold" },
  joinButton: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 10 },
});
