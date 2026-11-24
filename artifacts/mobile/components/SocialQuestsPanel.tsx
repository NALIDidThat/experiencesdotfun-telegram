import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListQuestNotificationsQueryKey,
  getListSocialQuestsQueryKey,
  useAcceptSocialQuest,
  useCreateSocialQuest,
  useDeclineSocialQuest,
  useListQuestNotifications,
  useListSocialQuests,
  useMarkQuestNotificationRead,
  type QuestNotification,
} from "@workspace/api-client-react";
import { PoppinsText as Text } from "@/components/Typography";
import { useColors } from "@/hooks/useColors";

type Friend = { id: number; name: string };

export function SocialQuestsPanel({
  experienceId,
  experienceTitle,
  friends,
}: {
  experienceId: number | null;
  experienceTitle: string | null;
  friends: Friend[];
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const questsQuery = useListSocialQuests({
    query: { queryKey: getListSocialQuestsQueryKey(), retry: 1 },
  });
  const createQuest = useCreateSocialQuest();
  const acceptQuest = useAcceptSocialQuest();
  const declineQuest = useDeclineSocialQuest();
  const quests = questsQuery.data ?? [];
  const selectedInvitees = useMemo(
    () => friends.filter((friend) => inviteeIds.includes(friend.id)),
    [friends, inviteeIds],
  );
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListSocialQuestsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListQuestNotificationsQueryKey() }),
    ]);
  };

  const toggleInvitee = (id: number) => {
    setNotice("");
    setInviteeIds((selected) => {
      if (selected.includes(id)) return selected.filter((value) => value !== id);
      if (selected.length >= 8) {
        setNotice("Choose up to eight friends.");
        return selected;
      }
      return [...selected, id];
    });
  };

  const submit = () => {
    if (!experienceId || !experienceTitle || selectedInvitees.length === 0 || createQuest.isPending) return;
    setNotice("");
    const title = `${experienceTitle} together`.slice(0, 100);
    createQuest.mutate({
      data: {
        title,
        experienceId,
        participantIds: selectedInvitees.map((friend) => friend.id),
        targetCount: 2,
      },
    }, {
      onSuccess: async () => {
        setInviteeIds([]);
        setNotice("Quest invitations sent. Verified attendance counts for progress.");
        await refresh();
      },
      onError: () => setNotice("Could not start the quest. Check that your relationships and experience are still active."),
    });
  };

  const respond = (questId: number, accept: boolean) => {
    const mutation = accept ? acceptQuest : declineQuest;
    mutation.mutate({ questId }, {
      onSuccess: refresh,
      onError: () => setNotice("That invitation is no longer available. Refresh and try again."),
    });
  };

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.primary + "12" }]}>
          <Feather name="users" size={17} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>SHARED OBJECTIVES</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Social quests</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Invite up to eight accepted friends or active partners. The quest completes when two participants have verified attendance.
          </Text>
        </View>
      </View>

      {!experienceId ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Select an open experience above to create a quest.
        </Text>
      ) : (
        <View style={[styles.createBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.createTitle, { color: colors.foreground }]} numberOfLines={2}>
            {experienceTitle} together
          </Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Progress counts only after experience attendance is verified. Other invitees can join before the target is reached.
          </Text>
          {friends.length ? (
            <View style={styles.friendList}>
              {friends.map((friend) => {
                const selected = inviteeIds.includes(friend.id);
                return (
                  <Pressable
                    key={friend.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Invite ${friend.name}`}
                    testID={`social-quest-friend-${friend.id}`}
                    onPress={() => toggleInvitee(friend.id)}
                    style={[
                      styles.friendChip,
                      {
                        backgroundColor: selected ? colors.primary + "12" : colors.card,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name={selected ? "check-circle" : "circle"}
                      size={15}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                    <Text numberOfLines={1} style={[styles.friendName, { color: colors.foreground }]}>
                      {friend.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Accepted participant friends will appear here.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            testID="social-quest-create"
            onPress={submit}
            disabled={!selectedInvitees.length || createQuest.isPending}
            style={[
              styles.primaryButton,
              {
                backgroundColor: selectedInvitees.length ? colors.primary : colors.border,
                opacity: createQuest.isPending ? 0.75 : 1,
              },
            ]}
          >
            {createQuest.isPending
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Feather name="send" size={15} color={colors.primaryForeground} />}
            <Text style={[styles.buttonText, { color: selectedInvitees.length ? colors.primaryForeground : colors.mutedForeground }]}>
              Invite {selectedInvitees.length || "friends"} · target 2 verified
            </Text>
          </Pressable>
        </View>
      )}

      {!!notice && (
        <Text accessibilityRole="alert" style={[styles.notice, { color: notice.startsWith("Could not") ? colors.destructive : colors.success }]}>
          {notice}
        </Text>
      )}

      <View style={styles.listHeading}>
        <Text style={[styles.listTitle, { color: colors.foreground }]}>Your quests</Text>
        <Text style={[styles.counter, { color: colors.mutedForeground }]}>{quests.length}</Text>
      </View>
      {questsQuery.isLoading ? (
        <View style={styles.loading}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : questsQuery.isError ? (
        <Text style={[styles.hint, { color: colors.destructive }]}>Quests could not load. Try again in a moment.</Text>
      ) : quests.length ? (
        quests.map((quest) => {
          const viewer = quest.participants.find((participant) => participant.isViewer);
          const invited = viewer?.status === "invited";
          return (
            <View key={quest.id} testID={`social-quest-${quest.id}`} style={[styles.questCard, { borderColor: colors.border }]}>
              <View style={styles.questHeader}>
                <Text style={[styles.questTitle, { color: colors.foreground }]}>{quest.title}</Text>
                <Text style={[styles.questStatus, { color: quest.status === "completed" ? colors.success : colors.primary }]}>
                  {quest.status === "completed" ? "Complete" : `${quest.progress}/${quest.targetCount}`}
                </Text>
              </View>
              <Text style={[styles.questMeta, { color: colors.mutedForeground }]}>
                {quest.experience.title} · {quest.experience.city}
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, {
                  backgroundColor: colors.primary,
                  width: `${Math.min(100, (quest.progress / quest.targetCount) * 100)}%`,
                }]} />
              </View>
              {quest.participants.map((participant) => (
                <View key={participant.id} style={[styles.participantRow, { borderTopColor: colors.border }]}>
                  <Feather
                    name={participant.status === "completed" ? "check-circle" : participant.status === "invited" ? "clock" : "user"}
                    size={14}
                    color={participant.status === "completed" ? colors.success : colors.mutedForeground}
                  />
                  <Text style={[styles.participantName, { color: colors.foreground }]} numberOfLines={1}>
                    {participant.name}{participant.isViewer ? " · you" : ""}
                  </Text>
                  <Text style={[styles.participantState, { color: colors.mutedForeground }]}>
                    {participant.status === "completed"
                      ? "Verified"
                      : participant.status === "invited"
                        ? quest.status === "completed" ? "Closed" : "Invited"
                        : "In"}
                  </Text>
                </View>
              ))}
              {invited && (
                <View style={styles.responseRow}>
                  <Pressable accessibilityRole="button" testID={`social-quest-decline-${quest.id}`} onPress={() => respond(quest.id, false)} style={[styles.secondaryButton, { borderColor: colors.border }]}>
                    <Text style={[styles.secondaryText, { color: colors.mutedForeground }]}>Decline</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" testID={`social-quest-accept-${quest.id}`} onPress={() => respond(quest.id, true)} style={[styles.primaryButton, { flex: 1, backgroundColor: colors.primary }]}>
                    {acceptQuest.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={15} color={colors.primaryForeground} />}
                    <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Accept quest</Text>
                  </Pressable>
                </View>
              )}
              {viewer?.rewardGrantedAt && (
                <Text style={[styles.recognition, { color: colors.success }]}>Verified completion recognition granted · no XP added</Text>
              )}
            </View>
          );
        })
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Shared quests and invitations will appear here.</Text>
      )}
      <QuestNotificationsPanel />
    </View>
  );
}

export function QuestNotificationsPanel() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const notificationsQuery = useListQuestNotifications({
    query: { queryKey: getListQuestNotificationsQueryKey(), retry: 1 },
  });
  const markRead = useMarkQuestNotificationRead();
  const notifications = notificationsQuery.data ?? [];
  if (notifications.length === 0) return null;
  return (
    <View style={[styles.notifications, { borderColor: colors.border }]}>
      <Text style={[styles.listTitle, { color: colors.foreground }]}>Quest updates</Text>
      {notifications.slice(0, 4).map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          testID={`quest-notification-${notification.id}`}
          onPress={() => {
            if (notification.readAt) return;
            markRead.mutate({ notificationId: notification.id }, {
              onSuccess: () => queryClient.invalidateQueries({ queryKey: getListQuestNotificationsQueryKey() }),
            });
          }}
          style={styles.notificationRow}
        >
          <Feather name={notification.readAt ? "bell" : "bell-off"} size={14} color={notification.readAt ? colors.mutedForeground : colors.primary} />
          <Text style={[styles.notificationText, { color: colors.foreground }]} numberOfLines={2}>
            {notificationCopy(notification)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function notificationCopy(notification: QuestNotification) {
  switch (notification.type) {
    case "invitation": return `${notification.actor.name} invited you to ${notification.questTitle}.`;
    case "participant_completed": return `${notification.actor.name} completed a verified step in ${notification.questTitle}.`;
    case "quest_completed": return `${notification.questTitle} reached its shared target.`;
    case "reward_granted": return `Completion recognition is ready for ${notification.questTitle}.`;
  }
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
  createTitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 11, lineHeight: 16, fontFamily: "Inter_400Regular", marginTop: 7 },
  friendList: { gap: 7, marginTop: 10 },
  friendChip: { minHeight: 40, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  friendName: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  primaryButton: { minHeight: 43, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 10 },
  buttonText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  secondaryButton: { minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", marginTop: 10 },
  secondaryText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  notice: { fontSize: 11, lineHeight: 16, marginTop: 8, textAlign: "center" },
  listHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 17, marginBottom: 6 },
  listTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  counter: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  loading: { padding: 16, alignItems: "center" },
  questCard: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 8 },
  questHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  questTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold" },
  questStatus: { fontSize: 10, fontFamily: "Inter_700Bold" },
  questMeta: { fontSize: 10, lineHeight: 14, marginTop: 4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 9 },
  progressFill: { height: "100%", borderRadius: 3 },
  participantRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 5, paddingTop: 5 },
  participantName: { flex: 1, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  participantState: { fontSize: 9, fontFamily: "Inter_500Medium" },
  responseRow: { flexDirection: "row", gap: 8 },
  recognition: { fontSize: 10, lineHeight: 14, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  notifications: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  notificationRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  notificationText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: "Inter_500Medium" },
});
