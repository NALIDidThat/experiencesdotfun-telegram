import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountabilityDashboardQueryKey,
  useAcceptAccountabilityInvitation,
  useConfirmAccountabilityCheckIn,
  useCreateAccountabilityCheckIn,
  useCreateAccountabilityCommitment,
  useCreateAccountabilityInvitation,
  useDeclineAccountabilityInvitation,
  useEndAccountabilityPartnership,
  useGetAccountabilityDashboard,
  useMarkAccountabilityNotificationRead,
  useSendAccountabilityEncouragement,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

type Friend = {
  id: number;
  name: string;
  username: string | null;
  avatarUrl?: string | null;
};

type Feedback = { message: string; tone: "success" | "error" };
type CheckInStatus = "completed" | "partial" | "missed" | "rescheduled";
type EncouragementType = "keep_going" | "nearly_there" | "proud_of_you" | "lets_do_this" | "join_me";

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function accountabilityDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function AccountabilitySection({ friends }: { friends: Friend[] }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const dashboard = useGetAccountabilityDashboard({
    query: {
      queryKey: [...getGetAccountabilityDashboardQueryKey(), user?.id],
      enabled: user?.userType === "participant",
      refetchInterval: 15_000,
    },
  });
  const refreshDashboard = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetAccountabilityDashboardQueryKey(),
    });
  };
  const mutationOptions = { onSuccess: refreshDashboard };
  const invite = useCreateAccountabilityInvitation({ mutation: mutationOptions });
  const accept = useAcceptAccountabilityInvitation({ mutation: mutationOptions });
  const decline = useDeclineAccountabilityInvitation({ mutation: mutationOptions });
  const endPartnership = useEndAccountabilityPartnership({ mutation: mutationOptions });
  const createCommitment = useCreateAccountabilityCommitment({ mutation: mutationOptions });
  const createCheckIn = useCreateAccountabilityCheckIn({ mutation: mutationOptions });
  const confirmCheckIn = useConfirmAccountabilityCheckIn({ mutation: mutationOptions });
  const sendEncouragement = useSendAccountabilityEncouragement({ mutation: mutationOptions });
  const markRead = useMarkAccountabilityNotificationRead({ mutation: mutationOptions });

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [friendSearch, setFriendSearch] = useState("");
  const [commitmentFormOpen, setCommitmentFormOpen] = useState(false);
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentDescription, setCommitmentDescription] = useState("");
  const [commitmentDeadline, setCommitmentDeadline] = useState("");
  const [commitmentTarget, setCommitmentTarget] = useState("1");
  const [assignee, setAssignee] = useState<"me" | "partner">("me");
  const [checkInCommitmentId, setCheckInCommitmentId] = useState<number | null>(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const activePartner = dashboard.data?.activePartner ?? null;
  const partnerId = activePartner?.partner.id;
  const incoming = dashboard.data?.incomingInvitations ?? [];
  const outgoing = dashboard.data?.outgoingInvitations ?? [];
  const commitments = dashboard.data?.commitments ?? [];
  const activeCommitments = commitments.filter((commitment) => commitment.status === "active");
  const completedCommitments = commitments.filter((commitment) => commitment.status === "completed").slice(0, 2);
  const visibleCommitments = [...activeCommitments, ...completedCommitments];
  const notifications = dashboard.data?.notifications ?? [];
  const searchTerm = friendSearch.trim().replace(/^@+/, "").toLowerCase();
  const matchingFriends = friends
    .filter((friend) => {
      if (!searchTerm) return true;
      return (
        friend.name.toLowerCase().includes(searchTerm) ||
        (friend.username ?? "").toLowerCase().includes(searchTerm)
      );
    })
    .slice(0, 8);

  const runAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    fallbackMessage: string,
  ): Promise<boolean> => {
    setFeedback(null);
    try {
      await action();
      setFeedback({ message: successMessage, tone: "success" });
      return true;
    } catch (error) {
      setFeedback({ message: errorMessage(error, fallbackMessage), tone: "error" });
      return false;
    }
  };

  const inviteFriend = (friend: Friend) => {
    void runAction(
      () => invite.mutateAsync({ data: { friendUserId: friend.id } }),
      `Invitation sent to ${friend.name}. They can accept or decline before you share commitments.`,
      "That invitation could not be sent. Please try again.",
    );
  };

  const respondToInvitation = (invitationId: number, action: "accept" | "decline") => {
    const mutation = action === "accept" ? accept : decline;
    const success = action === "accept" ? "You’re now accountability partners." : "Invitation declined.";
    void runAction(
      () => mutation.mutateAsync({ invitationId }),
      success,
      "That invitation could not be updated. Please try again.",
    );
  };

  const submitCommitment = () => {
    if (!user || !activePartner) return;
    const title = commitmentTitle.trim();
    const targetValue = Number(commitmentTarget);
    if (!title) {
      setFeedback({ message: "Add a short title for the commitment.", tone: "error" });
      return;
    }
    if (!Number.isInteger(targetValue) || targetValue < 1 || targetValue > 100) {
      setFeedback({ message: "Set a target between 1 and 100.", tone: "error" });
      return;
    }

    const date = commitmentDeadline.trim();
    const deadline = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
    if (date && (Number.isNaN(deadline?.getTime()) || deadline?.toISOString().slice(0, 10) !== date)) {
      setFeedback({ message: "Enter the deadline as YYYY-MM-DD.", tone: "error" });
      return;
    }

    const data = {
      title,
      description: commitmentDescription.trim() || undefined,
      assignedUserId: assignee === "me" ? user.id : activePartner.partner.id,
      targetValue,
      deadline: date || undefined,
    };
    void runAction(
      () => createCommitment.mutateAsync({ data }),
      "Commitment added to your shared plan.",
      "That commitment could not be saved. Please try again.",
    ).then((saved) => {
      if (!saved) return;
      setCommitmentTitle("");
      setCommitmentDescription("");
      setCommitmentDeadline("");
      setCommitmentTarget("1");
      setAssignee("me");
      setCommitmentFormOpen(false);
      Keyboard.dismiss();
    });
  };

  const submitCheckIn = (commitmentId: number, status: CheckInStatus) => {
    void runAction(
      () => createCheckIn.mutateAsync({
        commitmentId,
        data: { status, note: checkInNote.trim() || undefined },
      }),
      "Check-in shared with your partner.",
      "That check-in could not be saved. Please try again.",
    ).then((saved) => {
      if (!saved) return;
      setCheckInCommitmentId(null);
      setCheckInNote("");
      Keyboard.dismiss();
    });
  };

  const sendEncouragementMessage = (message: EncouragementType, label: string) => {
    void runAction(
      () => sendEncouragement.mutateAsync({ data: { message } }),
      `Encouragement sent: “${label}”`,
      "That note could not be sent. Please try again.",
    );
  };

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: colors.radius + 2,
    borderWidth: 1,
  } as const;
  const primaryButton = {
    backgroundColor: colors.primary,
    borderRadius: colors.radius - 4,
  } as const;
  const quietButton = {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: colors.radius - 4,
    borderWidth: 1,
  } as const;

  if (user?.userType !== "participant") return null;

  return (
    <View testID="accountability-section" style={{ gap: 16, marginBottom: 18 }}>
      <View style={{ gap: 4, marginTop: 4 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather name="target" size={18} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Accountability
          </Text>
          {(dashboard.data?.unreadCount ?? 0) > 0 ? (
            <View style={{ alignItems: "center", backgroundColor: colors.primary + "18", borderRadius: 20, minWidth: 24, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                {dashboard.data?.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
          Make a plan together, check in honestly, and keep your progress private to the two of you.
        </Text>
      </View>

      {feedback ? (
        <View
          style={{
            alignItems: "flex-start",
            backgroundColor: feedback.tone === "success" ? colors.success + "12" : colors.destructive + "12",
            borderColor: feedback.tone === "success" ? colors.success + "45" : colors.destructive + "45",
            borderRadius: colors.radius - 4,
            borderWidth: 1,
            flexDirection: "row",
            gap: 8,
            padding: 11,
          }}
        >
          <Feather
            name={feedback.tone === "success" ? "check-circle" : "alert-circle"}
            size={16}
            color={feedback.tone === "success" ? colors.success : colors.destructive}
          />
          <Text
            accessibilityRole="alert"
            style={{
              color: feedback.tone === "success" ? colors.success : colors.destructive,
              flex: 1,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {feedback.message}
          </Text>
        </View>
      ) : null}

      {dashboard.isLoading ? (
        <View style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading your accountability space…</Text>
        </View>
      ) : dashboard.isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading accountability"
          onPress={() => void dashboard.refetch()}
          style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}
        >
          <Feather name="refresh-cw" size={16} color={colors.primary} />
          <Text style={{ color: colors.foreground, flex: 1, fontSize: 13 }}>
            Your accountability space couldn’t load. Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      {!dashboard.isLoading && !dashboard.isError && !activePartner ? (
        <View style={[cardStyle, { gap: 13, padding: 16 }]}>
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", backgroundColor: colors.primary + "14", borderRadius: 24, height: 44, justifyContent: "center", width: 44 }}>
              <Feather name="users" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
                Accountability works better together
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
                Invite someone you trust. They must accept before either of you can share commitments.
              </Text>
            </View>
          </View>
          {friends.length ? (
            <View style={{ gap: 9 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                Choose an accepted friend
              </Text>
              <View style={{
                alignItems: "center",
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: colors.radius - 4,
                borderWidth: 1,
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 11,
              }}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  accessibilityLabel="Search friends for an accountability partner"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setFriendSearch}
                  placeholder="Search friends"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ color: colors.foreground, flex: 1, fontSize: 14, minHeight: 42 }}
                  value={friendSearch}
                />
              </View>
              {matchingFriends.map((friend) => {
                const alreadyInvited = outgoing.some((item) => item.user.id === friend.id);
                const hasIncoming = incoming.some((item) => item.user.id === friend.id);
                const pending = invite.isPending;
                return (
                  <View
                    key={friend.id}
                    style={[cardStyle, {
                      alignItems: "center",
                      flexDirection: "row",
                      gap: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                    }]}
                  >
                    <UserAvatar
                      avatarUrl={friend.avatarUrl}
                      name={friend.name}
                      containerStyle={{
                        alignItems: "center",
                        backgroundColor: colors.primary + "12",
                        borderRadius: 22,
                        height: 40,
                        justifyContent: "center",
                        width: 40,
                      }}
                      initialStyle={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                        {friend.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                        {friend.username ? `@${friend.username}` : "Experiences.fun friend"}
                      </Text>
                    </View>
                    {alreadyInvited ? (
                      <View style={{ alignItems: "center", backgroundColor: colors.secondary + "18", borderRadius: 20, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 7 }}>
                        <Feather name="clock" size={12} color={colors.secondary} />
                        <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>Invited</Text>
                      </View>
                    ) : hasIncoming ? (
                      <View style={{ alignItems: "center", backgroundColor: colors.teal + "18", borderRadius: 20, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 7 }}>
                        <Feather name="arrow-down-left" size={12} color={colors.teal} />
                        <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>Invited you</Text>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Invite ${friend.name} as your accountability partner`}
                        accessibilityState={{ disabled: pending }}
                        disabled={pending}
                        onPress={() => inviteFriend(friend)}
                        style={({ pressed }) => [
                          primaryButton,
                          { alignItems: "center", flexDirection: "row", gap: 6, opacity: pending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                        ]}
                      >
                        {pending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="user-plus" size={13} color={colors.primaryForeground} />}
                        <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "600" }}>
                          Invite
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {!matchingFriends.length ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 5 }}>
                  No friends match that search.
                </Text>
              ) : null}
              {friends.length > matchingFriends.length ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  Search to find more friends.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 4, padding: 12 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                Add someone to your circle first
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                Send them a friend request below. Once they accept, you can invite them here.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {incoming.length > 0 ? (
        <View style={[cardStyle, { gap: 12, padding: 15 }]}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
            <Feather name="user-check" size={17} color={colors.teal} />
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
              Partner invitations
            </Text>
          </View>
          {incoming.map((invitation) => {
            const pending = accept.isPending || decline.isPending;
            return (
              <View key={invitation.id} style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 10, padding: 11 }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                  <UserAvatar
                    avatarUrl={invitation.user.avatarUrl}
                    name={invitation.user.name}
                    containerStyle={{ alignItems: "center", backgroundColor: colors.teal + "18", borderRadius: 20, height: 38, justifyContent: "center", width: 38 }}
                    initialStyle={{ color: colors.teal, fontSize: 13, fontWeight: "700" }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                      {invitation.user.name} invited you
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      {invitation.user.username ? `@${invitation.user.username} · ` : ""}
                      Expires {timeLabel(invitation.expiresAt)}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                  Accepting lets you both share private commitments and check-ins. You can end the partnership at any time.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${invitation.user.name}'s partner invitation`}
                    disabled={pending}
                    onPress={() => respondToInvitation(invitation.id, "decline")}
                    style={[quietButton, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 39, opacity: pending ? 0.55 : 1 }]}
                  >
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>Decline</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Accept ${invitation.user.name}'s partner invitation`}
                    disabled={pending}
                    onPress={() => respondToInvitation(invitation.id, "accept")}
                    style={[primaryButton, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 39, opacity: pending ? 0.55 : 1 }]}
                  >
                    {pending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "600" }}>Accept invitation</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {outgoing.length > 0 ? (
        <View style={[cardStyle, { gap: 10, padding: 15 }]}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Waiting for a reply
          </Text>
          {outgoing.map((invitation) => (
            <View key={invitation.id} style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, flexDirection: "row", gap: 9, padding: 10 }}>
              <Feather name="clock" size={15} color={colors.secondary} />
              <Text style={{ color: colors.foreground, flex: 1, fontSize: 13 }}>
                {invitation.user.name} has 14 days to respond.
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {activePartner ? (
        <>
          <View style={[cardStyle, { gap: 13, padding: 15 }]}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 11 }}>
              <UserAvatar
                avatarUrl={activePartner.partner.avatarUrl}
                name={activePartner.partner.name}
                containerStyle={{ alignItems: "center", backgroundColor: colors.primary + "16", borderRadius: 26, height: 52, justifyContent: "center", width: 52 }}
                initialStyle={{ color: colors.primary, fontSize: 17, fontWeight: "700" }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
                  Your accountability partner
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700", marginTop: 3 }}>
                  {activePartner.partner.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {activePartner.partner.username ? `@${activePartner.partner.username} · ` : ""}
                  Since {timeLabel(activePartner.acceptedAt)}
                </Text>
              </View>
              <View style={{ alignItems: "center", backgroundColor: colors.success + "16", borderRadius: 20, flexDirection: "row", gap: 5, paddingHorizontal: 9, paddingVertical: 6 }}>
                <Feather name="check-circle" size={13} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700" }}>Active</Text>
              </View>
            </View>
            <View style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 4, padding: 11 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                Support, not surveillance
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                Check-ins are self-reported unless your partner confirms them. Manual check-ins never award XP.
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
                Send a little encouragement
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {([
                  ["keep_going", "Keep going"],
                  ["nearly_there", "Nearly there"],
                  ["proud_of_you", "Proud of you"],
                  ["lets_do_this", "Let’s do this"],
                  ["join_me", "Want to join me?"],
                ] as Array<[EncouragementType, string]>).map(([message, label]) => (
                  <Pressable
                    key={message}
                    accessibilityRole="button"
                    accessibilityLabel={`Send encouragement: ${label}`}
                    disabled={sendEncouragement.isPending}
                    onPress={() => sendEncouragementMessage(message, label)}
                    style={({ pressed }) => [
                      quietButton,
                      { alignItems: "center", flexDirection: "row", gap: 6, opacity: sendEncouragement.isPending ? 0.55 : pressed ? 0.75 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                    ]}
                  >
                    <Feather name="heart" size={13} color={colors.primary} />
                    <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {confirmEnd ? (
              <View style={{ backgroundColor: colors.destructive + "10", borderRadius: colors.radius - 4, gap: 8, padding: 11 }}>
                <Text style={{ color: colors.foreground, fontSize: 13 }}>
                  End this partnership? Your active commitments will be cancelled and private to this partnership.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => setConfirmEnd(false)} style={[quietButton, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 36 }]}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Keep partnership</Text>
                  </Pressable>
                  <Pressable
                    disabled={endPartnership.isPending}
                    onPress={() => {
                      void runAction(
                        () => endPartnership.mutateAsync({ partnershipId: activePartner.partnershipId }),
                        "Partnership ended.",
                        "The partnership could not be ended. Please try again.",
                      ).then((ended) => {
                        if (ended) setConfirmEnd(false);
                      });
                    }}
                    style={[{ backgroundColor: colors.destructive, borderRadius: colors.radius - 4 }, { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 36, opacity: endPartnership.isPending ? 0.55 : 1 }]}
                  >
                    {endPartnership.isPending ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>End partnership</Text>}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmEnd(true)}
                style={{ alignSelf: "flex-start", paddingVertical: 4 }}
              >
                <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "600" }}>End partnership</Text>
              </Pressable>
            )}
          </View>

          <View style={[cardStyle, { gap: 13, padding: 15 }]}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
                  Shared commitments
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                  Small plans that move you toward real experiences.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={commitmentFormOpen ? "Close commitment form" : "Create a shared commitment"}
                onPress={() => {
                  setCommitmentFormOpen((open) => !open);
                  setFeedback(null);
                }}
                style={({ pressed }) => [
                  primaryButton,
                  { alignItems: "center", flexDirection: "row", gap: 6, opacity: pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 9 },
                ]}
              >
                <Feather name={commitmentFormOpen ? "x" : "plus"} size={14} color={colors.primaryForeground} />
                <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                  {commitmentFormOpen ? "Close" : "Add"}
                </Text>
              </Pressable>
            </View>

            {commitmentFormOpen ? (
              <View style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 9, padding: 12 }}>
                <TextInput
                  accessibilityLabel="Commitment title"
                  maxLength={120}
                  onChangeText={setCommitmentTitle}
                  placeholder="What will you follow through on?"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 14, minHeight: 43, paddingHorizontal: 10 }}
                  value={commitmentTitle}
                />
                <TextInput
                  accessibilityLabel="Commitment details"
                  maxLength={500}
                  multiline
                  onChangeText={setCommitmentDescription}
                  placeholder="Add a little context (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 13, minHeight: 64, paddingHorizontal: 10, paddingTop: 10, textAlignVertical: "top" }}
                  value={commitmentDescription}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    accessibilityLabel="Target number of check-ins"
                    keyboardType="number-pad"
                    maxLength={3}
                    onChangeText={setCommitmentTarget}
                    placeholder="Target"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, flex: 1, fontSize: 13, minHeight: 42, paddingHorizontal: 10 }}
                    value={commitmentTarget}
                  />
                  <TextInput
                    accessibilityLabel="Commitment deadline in YYYY-MM-DD format"
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    onChangeText={setCommitmentDeadline}
                    placeholder="Due YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, flex: 2, fontSize: 13, minHeight: 42, paddingHorizontal: 10 }}
                    value={commitmentDeadline}
                  />
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                  The target counts completed check-ins. Leave it at 1 for a one-time commitment.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    ["me", "For me"],
                    ["partner", `For ${activePartner.partner.name}`],
                  ] as const).map(([value, label]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: assignee === value }}
                      onPress={() => setAssignee(value)}
                      style={{
                        alignItems: "center",
                        backgroundColor: assignee === value ? colors.primary + "16" : colors.card,
                        borderColor: assignee === value ? colors.primary : colors.border,
                        borderRadius: colors.radius - 4,
                        borderWidth: 1,
                        flex: 1,
                        flexDirection: "row",
                        gap: 7,
                        justifyContent: "center",
                        minHeight: 38,
                      }}
                    >
                      <Feather name={value === "me" ? "user" : "users"} size={13} color={assignee === value ? colors.primary : colors.mutedForeground} />
                      <Text style={{ color: assignee === value ? colors.primary : colors.foreground, fontSize: 12, fontWeight: "600" }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={createCommitment.isPending}
                  onPress={submitCommitment}
                  style={({ pressed }) => [
                    primaryButton,
                    { alignItems: "center", flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 42, opacity: createCommitment.isPending ? 0.55 : pressed ? 0.8 : 1 },
                  ]}
                >
                  {createCommitment.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={15} color={colors.primaryForeground} />}
                  <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "700" }}>
                    Save commitment
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {activeCommitments.length === 0 ? (
              <View style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 6, padding: 16 }}>
                <Feather name="clipboard" size={20} color={colors.teal} />
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                  No active commitments yet
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
                  Choose one meaningful next step and share it with {activePartner.partner.name}.
                </Text>
              </View>
            ) : null}

            {visibleCommitments.map((commitment) => {
              const progress = Math.min(100, Math.round((commitment.currentValue / commitment.targetValue) * 100));
              const isAssignedToUser = commitment.assignedTo.id === user?.id;
              const verificationLabel = commitment.verificationStatus === "partner_confirmed"
                ? "Partner confirmed"
                : commitment.verificationStatus === "experience_verified"
                  ? "Experience verified"
                  : "Self-reported";
              const checking = checkInCommitmentId === commitment.id;
              return (
                <View key={commitment.id} style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 9, padding: 12 }}>
                  <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 9 }}>
                    <View style={{ alignItems: "center", backgroundColor: commitment.status === "completed" ? colors.success + "18" : colors.teal + "18", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}>
                      <Feather name={commitment.status === "completed" ? "check-circle" : "target"} size={16} color={commitment.status === "completed" ? colors.success : colors.teal} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", lineHeight: 19 }}>
                        {commitment.title}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 3 }}>
                        For {commitment.assignedTo.id === user?.id ? "you" : commitment.assignedTo.name}
                        {commitment.deadline ? ` · Due ${accountabilityDateLabel(commitment.deadline)}` : ""}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: commitment.status === "completed" ? colors.success + "16" : colors.teal + "16", borderRadius: 18, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <Text style={{ color: commitment.status === "completed" ? colors.success : colors.teal, fontSize: 10, fontWeight: "700" }}>
                        {commitment.status === "completed" ? "Done" : `${commitment.currentValue}/${commitment.targetValue}`}
                      </Text>
                    </View>
                  </View>
                  {commitment.description ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                      {commitment.description}
                    </Text>
                  ) : null}
                  <View style={{ backgroundColor: colors.border, borderRadius: 5, height: 5, overflow: "hidden" }}>
                    <View style={{ backgroundColor: commitment.status === "completed" ? colors.success : colors.teal, borderRadius: 5, height: 5, width: `${commitment.status === "completed" ? 100 : progress}%` }} />
                  </View>
                  {commitment.latestCheckIn ? (
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                      <Feather name="check" size={12} color={colors.mutedForeground} />
                      <Text style={{ color: colors.mutedForeground, flex: 1, fontSize: 11 }}>
                        Latest check-in: {commitment.latestCheckIn.status.replace("_", " ")} · {verificationLabel}
                      </Text>
                    </View>
                  ) : null}
                  {commitment.status === "active" && isAssignedToUser ? (
                    checking ? (
                      <View style={{ backgroundColor: colors.card, borderRadius: colors.radius - 4, gap: 9, padding: 10 }}>
                        <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                          How did it go?
                        </Text>
                        <TextInput
                          accessibilityLabel="Optional private-to-partners check-in note"
                          maxLength={500}
                          multiline
                          onChangeText={setCheckInNote}
                          placeholder="Add a note for your partner (optional)"
                          placeholderTextColor={colors.mutedForeground}
                          style={{ backgroundColor: colors.background, borderColor: colors.border, borderRadius: colors.radius - 4, borderWidth: 1, color: colors.foreground, fontSize: 12, minHeight: 54, padding: 9, textAlignVertical: "top" }}
                          value={checkInNote}
                        />
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                          {([
                            ["completed", "Completed", "check"],
                            ["partial", "Made progress", "activity"],
                            ["rescheduled", "Rescheduled", "calendar"],
                            ["missed", "Not this time", "clock"],
                          ] as Array<[CheckInStatus, string, keyof typeof Feather.glyphMap]>).map(([status, label, icon]) => (
                            <Pressable
                              key={status}
                              accessibilityRole="button"
                              disabled={createCheckIn.isPending}
                              onPress={() => submitCheckIn(commitment.id, status)}
                              style={({ pressed }) => [
                                quietButton,
                                { alignItems: "center", flexDirection: "row", gap: 5, opacity: createCheckIn.isPending ? 0.55 : pressed ? 0.75 : 1, paddingHorizontal: 8, paddingVertical: 7 },
                              ]}
                            >
                              <Feather name={icon} size={12} color={colors.primary} />
                              <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: "600" }}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Pressable onPress={() => { setCheckInCommitmentId(null); setCheckInNote(""); }} style={{ alignSelf: "flex-start", paddingVertical: 3 }}>
                          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Cancel</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Check in on ${commitment.title}`}
                        onPress={() => {
                          setCheckInCommitmentId(commitment.id);
                          setCheckInNote("");
                        }}
                        style={({ pressed }) => [
                          quietButton,
                          { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: pressed ? 0.75 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                        ]}
                      >
                        <Feather name="edit-3" size={13} color={colors.primary} />
                        <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>Check in</Text>
                      </Pressable>
                    )
                  ) : commitment.status === "completed" ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                      {verificationLabel}. This check-in does not award XP.
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={[cardStyle, { gap: 11, padding: 15 }]}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
              <Feather name="activity" size={17} color={colors.teal} />
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
                Partner activity
              </Text>
            </View>
            {dashboard.data?.activity.length ? (
              dashboard.data.activity.slice(0, 12).map((event) => (
                <View key={event.id} style={{ backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 6, padding: 11 }}>
                  <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 8 }}>
                    <View style={{ alignItems: "center", backgroundColor: colors.teal + "16", borderRadius: 15, height: 30, justifyContent: "center", width: 30 }}>
                      <Feather
                        name={event.type === "encouragement_received" ? "heart" : event.type.includes("check_in") ? "check-circle" : event.type === "commitment_created" ? "target" : "users"}
                        size={14}
                        color={colors.teal}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                        {event.title}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                        {event.message}
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 5 }}>
                        {event.actor.name} · {timeLabel(event.createdAt)}
                      </Text>
                    </View>
                    {event.isUnread ? <View style={{ backgroundColor: colors.primary, borderRadius: 4, height: 8, width: 8 }} /> : null}
                  </View>
                  {event.checkIn?.status === "completed" &&
                    event.checkIn.verificationStatus === "self_reported" &&
                    event.actor.id !== user?.id ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm ${event.actor.name}'s check-in`}
                        disabled={confirmCheckIn.isPending}
                        onPress={() => {
                          void runAction(
                            () => confirmCheckIn.mutateAsync({ checkInId: event.checkIn!.id }),
                            "Completion confirmed. No XP was awarded.",
                            "That check-in could not be confirmed.",
                          );
                        }}
                        style={({ pressed }) => [
                          primaryButton,
                          { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: confirmCheckIn.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 7 },
                        ]}
                      >
                        {confirmCheckIn.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={13} color={colors.primaryForeground} />}
                        <Text style={{ color: colors.primaryForeground, fontSize: 11, fontWeight: "700" }}>Confirm check-in</Text>
                      </Pressable>
                    ) : null}
                </View>
              ))
            ) : (
              <View style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, gap: 5, padding: 15 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                  Your partnership is just getting started
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center" }}>
                  Set your first commitment together to make progress visible.
                </Text>
              </View>
            )}
          </View>
        </>
      ) : null}

      {notifications.length > 0 ? (
        <View style={[cardStyle, { gap: 10, padding: 15 }]}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
            <Feather name="bell" size={16} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>Notifications</Text>
            {(dashboard.data?.unreadCount ?? 0) > 0 ? (
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
                {dashboard.data?.unreadCount} unread
              </Text>
            ) : null}
          </View>
          {notifications.slice(0, 6).map((notification) => (
            <View key={notification.id} style={{ alignItems: "flex-start", backgroundColor: colors.background, borderColor: notification.isUnread ? colors.primary + "55" : colors.border, borderRadius: colors.radius - 4, borderWidth: 1, flexDirection: "row", gap: 9, padding: 10 }}>
              <Feather name={notification.isUnread ? "bell" : "check"} size={14} color={notification.isUnread ? colors.primary : colors.mutedForeground} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{notification.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 2 }}>{notification.message}</Text>
              </View>
              {notification.isUnread ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${notification.title} as read`}
                  disabled={markRead.isPending}
                  onPress={() => {
                    void runAction(
                      () => markRead.mutateAsync({ notificationId: notification.id }),
                      "Notification marked as read.",
                      "That notification could not be updated.",
                    );
                  }}
                  style={{ paddingHorizontal: 3, paddingVertical: 3 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Mark read</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}