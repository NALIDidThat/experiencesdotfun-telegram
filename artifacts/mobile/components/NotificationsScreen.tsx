import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountabilityDashboardQueryKey,
  useConfirmAccountabilityCheckIn,
  useGetAccountabilityDashboard,
  useMarkAccountabilityNotificationRead,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  onBack: () => void;
  onOpenFriends: () => void;
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "That update could not be completed. Please try again.";
}

export function NotificationsScreen({ onBack, onOpenFriends }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const dashboard = useGetAccountabilityDashboard({
    query: {
      queryKey: getGetAccountabilityDashboardQueryKey(),
      enabled: user?.userType === "participant",
      refetchInterval: 30_000,
    },
  });
  const refreshNotifications = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetAccountabilityDashboardQueryKey(),
    });
  };
  const mutationOptions = { onSuccess: refreshNotifications };
  const markRead = useMarkAccountabilityNotificationRead({ mutation: mutationOptions });
  const confirmCheckIn = useConfirmAccountabilityCheckIn({ mutation: mutationOptions });

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

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setFeedback(null);
    try {
      await action();
      setFeedback(successMessage);
    } catch (error) {
      setFeedback(errorMessage(error));
    }
  };

  const notifications = dashboard.data?.notifications ?? [];
  const unreadCount = dashboard.data?.unreadCount ?? 0;

  return (
    <ScrollView
      testID="notifications-screen"
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ gap: 14, paddingBottom: 24, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 8, paddingTop: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to profile"
          onPress={onBack}
          style={{ alignItems: "center", height: 44, justifyContent: "center", marginLeft: -8, width: 44 }}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "700" }}>
            Notifications
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: 3 }}>
            Partner invitations, check-ins, and shared progress.
          </Text>
        </View>
        {unreadCount > 0 ? (
          <View style={{ alignItems: "center", backgroundColor: colors.primary + "16", borderRadius: 18, minWidth: 34, paddingHorizontal: 9, paddingVertical: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
              {unreadCount}
            </Text>
          </View>
        ) : null}
      </View>

      {user?.userType !== "participant" ? (
        <View style={[cardStyle, { alignItems: "center", gap: 8, padding: 20 }]}>
          <Feather name="bell" size={22} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", textAlign: "center" }}>
            Participant notifications
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: "center" }}>
            Accountability notifications are available from a Participant profile.
          </Text>
        </View>
      ) : dashboard.isLoading ? (
        <View style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading your notifications…</Text>
        </View>
      ) : dashboard.isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading notifications"
          onPress={() => void dashboard.refetch()}
          style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}
        >
          <Feather name="refresh-cw" size={16} color={colors.primary} />
          <Text style={{ color: colors.foreground, flex: 1, fontSize: 13, lineHeight: 18 }}>
            Notifications couldn’t load. Tap to retry.
          </Text>
        </Pressable>
      ) : notifications.length === 0 ? (
        <View style={[cardStyle, { alignItems: "center", gap: 9, padding: 22 }]}>
          <View style={{ alignItems: "center", backgroundColor: colors.primary + "12", borderRadius: 25, height: 50, justifyContent: "center", width: 50 }}>
            <Feather name="bell" size={21} color={colors.primary} />
          </View>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", textAlign: "center" }}>
            You’re all caught up
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, textAlign: "center" }}>
            Partner invitations and check-in updates will appear here.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenFriends}
            style={({ pressed }) => [
              primaryButton,
              { alignItems: "center", flexDirection: "row", gap: 7, marginTop: 3, opacity: pressed ? 0.8 : 1, paddingHorizontal: 13, paddingVertical: 10 },
            ]}
          >
            <Feather name="users" size={14} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "700" }}>
              Open Friends & Partners
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {feedback ? (
            <View style={{ backgroundColor: colors.primary + "12", borderRadius: colors.radius - 4, padding: 11 }}>
              <Text accessibilityRole="alert" style={{ color: colors.foreground, fontSize: 13, lineHeight: 18 }}>
                {feedback}
              </Text>
            </View>
          ) : null}
          {notifications.map((notification) => {
            const canConfirmCheckIn =
              dashboard.data?.activePartner !== null &&
              notification.checkIn?.status === "completed" &&
              notification.checkIn.verificationStatus === "self_reported" &&
              notification.actor.id !== user?.id;
            return (
              <View
                key={notification.id}
                testID={`notification-${notification.id}`}
                style={[
                  cardStyle,
                  {
                    borderColor: notification.isUnread ? colors.primary + "55" : colors.border,
                    gap: 11,
                    padding: 13,
                  },
                ]}
              >
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
                  <UserAvatar
                    avatarUrl={notification.actor.avatarUrl}
                    name={notification.actor.name}
                    containerStyle={{
                      alignItems: "center",
                      backgroundColor: notification.isUnread ? colors.primary + "15" : colors.background,
                      borderRadius: 20,
                      height: 40,
                      justifyContent: "center",
                      width: 40,
                    }}
                    initialStyle={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
                      <Text style={{ color: colors.foreground, flex: 1, fontSize: 14, fontWeight: "700" }}>
                        {notification.title}
                      </Text>
                      {notification.isUnread ? (
                        <View style={{ backgroundColor: colors.primary, borderRadius: 4, height: 8, width: 8 }} />
                      ) : null}
                    </View>
                    <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                      {notification.message}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
                      {notification.actor.name} · {timeLabel(notification.createdAt)}
                    </Text>
                  </View>
                </View>
                {notification.type === "partner_invite" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review partner invitation"
                    onPress={onOpenFriends}
                    style={({ pressed }) => [
                      primaryButton,
                      { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                    ]}
                  >
                    <Feather name="arrow-right" size={13} color={colors.primaryForeground} />
                    <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                      Review invitation
                    </Text>
                  </Pressable>
                ) : null}
                {canConfirmCheckIn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${notification.actor.name}'s check-in`}
                    disabled={confirmCheckIn.isPending}
                    onPress={() => {
                      if (!notification.checkIn) return;
                      void runAction(
                        () => confirmCheckIn.mutateAsync({ checkInId: notification.checkIn!.id }),
                        "Check-in confirmed. No XP was awarded.",
                      );
                    }}
                    style={({ pressed }) => [
                      primaryButton,
                      { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: confirmCheckIn.isPending ? 0.55 : pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                    ]}
                  >
                    {confirmCheckIn.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="check" size={13} color={colors.primaryForeground} />}
                    <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                      Confirm check-in
                    </Text>
                  </Pressable>
                ) : null}
                {notification.isUnread ? (
                  <Pressable
                    testID={`notification-mark-read-${notification.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${notification.title} as read`}
                    disabled={markRead.isPending}
                    onPress={() => {
                      void runAction(
                        () => markRead.mutateAsync({ notificationId: notification.id }),
                        "Notification marked as read.",
                      );
                    }}
                    style={{ alignSelf: "flex-start", paddingVertical: 3 }}
                  >
                    {markRead.isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                        Mark as read
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}