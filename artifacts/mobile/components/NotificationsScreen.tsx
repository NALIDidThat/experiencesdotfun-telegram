import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountabilityDashboardQueryKey,
  getGetFeedPushSettingsQueryKey,
  getListFeedNotificationsQueryKey,
  getListFriendNotificationsQueryKey,
  useConfirmAccountabilityCheckIn,
  useGetAccountabilityDashboard,
  useGetFeedPushSettings,
  useListFriendNotifications,
  useListFeedNotifications,
  useMarkAccountabilityNotificationRead,
  useMarkFeedNotificationRead,
  useMarkFriendNotificationRead,
  useRegisterFeedPushToken,
  useDisableFeedPushNotifications,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  onBack: () => void;
  onOpenFriends: () => void;
  onOpenCommunityFeed: () => void;
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

export function NotificationsScreen({ onBack, onOpenFriends, onOpenCommunityFeed }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<"checking" | "granted" | "denied" | "unsupported" | "unknown">(
    Platform.OS === "web" ? "unsupported" : "checking",
  );
  const [pushCanAskAgain, setPushCanAskAgain] = useState(true);
  const dashboard = useGetAccountabilityDashboard({
    query: {
      queryKey: [...getGetAccountabilityDashboardQueryKey(), user?.id],
      enabled: user?.userType === "participant",
      refetchInterval: 30_000,
    },
  });
  const friendNotificationsQuery = useListFriendNotifications({
    query: {
      queryKey: [...getListFriendNotificationsQueryKey(), user?.id],
      enabled: Boolean(user),
      refetchInterval: 30_000,
    },
  });
  const feedNotificationsQuery = useListFeedNotifications({
    query: {
      queryKey: [...getListFeedNotificationsQueryKey(), user?.id],
      enabled: Boolean(user),
      refetchInterval: 30_000,
    },
  });
  const pushSettingsQuery = useGetFeedPushSettings({
    query: {
      queryKey: [...getGetFeedPushSettingsQueryKey(), user?.id],
      enabled: Boolean(user),
      retry: 1,
    },
  });
  const refreshPushSettings = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetFeedPushSettingsQueryKey(),
    });
  };
  const registerPushToken = useRegisterFeedPushToken({
    mutation: { onSuccess: refreshPushSettings },
  });
  const disablePushNotifications = useDisableFeedPushNotifications({
    mutation: { onSuccess: refreshPushSettings },
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    const refreshPermission = () => {
      void Notifications.getPermissionsAsync()
        .then((result) => {
          setPushPermission(result.granted ? "granted" : "denied");
          setPushCanAskAgain(result.canAskAgain);
        })
        .catch(() => setPushPermission("unknown"));
    };
    refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => subscription.remove();
  }, []);
  const refreshNotifications = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetAccountabilityDashboardQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getListFriendNotificationsQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getListFeedNotificationsQueryKey(),
    });
  };
  const mutationOptions = { onSuccess: refreshNotifications };
  const markRead = useMarkAccountabilityNotificationRead({ mutation: mutationOptions });
  const markFriendRead = useMarkFriendNotificationRead({ mutation: mutationOptions });
  const markFeedRead = useMarkFeedNotificationRead({ mutation: mutationOptions });
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

  const enablePushNotifications = async () => {
    setPushFeedback(null);
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      setPushFeedback("Operating-system notifications are available in the installed iOS or Android app, not in a browser or Telegram Mini App.");
      return;
    }
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("community", {
          name: "Community updates",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 200, 150, 200],
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) {
        permission = await Notifications.requestPermissionsAsync();
      }
      setPushPermission(permission.granted ? "granted" : "denied");
      setPushCanAskAgain(permission.canAskAgain);
      if (!permission.granted) {
        setPushFeedback(
          permission.canAskAgain
            ? "Notifications are still off. Allow them in the system prompt to continue."
            : "Notifications are blocked for this app. Open phone settings to allow them.",
        );
        return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      if (!projectId) {
        setPushFeedback("System permission is on, but push delivery needs this app linked to an Expo project with iOS and Android push credentials.");
        return;
      }
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await registerPushToken.mutateAsync({
        data: {
          token: token.data,
          platform: Platform.OS,
        },
      });
      setPushFeedback("Operating-system notifications are enabled for this profile.");
    } catch (error) {
      setPushFeedback(errorMessage(error));
    }
  };

  const turnOffPushNotifications = async () => {
    setPushFeedback(null);
    try {
      await disablePushNotifications.mutateAsync();
      setPushFeedback("Operating-system notifications are off for this profile. Phone permission settings were not changed.");
    } catch (error) {
      setPushFeedback(errorMessage(error));
    }
  };

  const pushActionPending =
    registerPushToken.isPending || disablePushNotifications.isPending;
  const pushEnabled = pushSettingsQuery.data?.enabled ?? false;
  const pushStatus = Platform.OS === "web"
    ? "Native push is not available in the browser or Telegram Mini App."
    : pushSettingsQuery.isError
      ? "Push settings could not load. Try again."
      : pushSettingsQuery.isLoading
        ? "Checking notification settings…"
        : pushPermission === "denied"
          ? "Notifications are blocked by this device."
          : pushEnabled
            ? "Enabled for this profile."
            : pushPermission === "granted"
              ? "Phone permission is allowed; push is not enabled for this profile."
              : "Off until you choose to enable it.";

  const isParticipant = user?.userType === "participant";
  const friendNotifications = friendNotificationsQuery.data?.notifications ?? [];
  const accountabilityNotifications = isParticipant ? dashboard.data?.notifications ?? [] : [];
  const feedNotifications = feedNotificationsQuery.data?.notifications ?? [];
  const notifications = [
    ...friendNotifications.map((notification) => ({ ...notification, source: "friend" as const })),
    ...accountabilityNotifications.map((notification) => ({ ...notification, source: "accountability" as const })),
    ...feedNotifications.map((notification) => ({ ...notification, source: "community" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount =
    (friendNotificationsQuery.data?.unreadCount ?? 0) +
    (isParticipant ? dashboard.data?.unreadCount ?? 0 : 0) +
    (feedNotificationsQuery.data?.unreadCount ?? 0);
  const isLoading =
    friendNotificationsQuery.isLoading ||
    feedNotificationsQuery.isLoading ||
    (isParticipant && dashboard.isLoading);
  const hasError =
    friendNotificationsQuery.isError ||
    (isParticipant && dashboard.isError);

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
            {feedNotificationsQuery.isError
              ? "Friend activity and check-ins are available. Community notifications could not load."
              : "Friend activity, community updates, partner invitations, and check-ins."}
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

      <View style={[cardStyle, { gap: 10, padding: 14 }]}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 9 }}>
          <View style={{ alignItems: "center", backgroundColor: colors.primary + "14", borderRadius: 10, height: 34, justifyContent: "center", width: 34 }}>
            <Feather name="bell" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
              Phone notifications
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
              You choose whether this app can send community update alerts.
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
          {pushStatus}
        </Text>
        {Platform.OS === "web" ? null : pushPermission === "denied" && !pushCanAskAgain ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open phone notification settings"
            onPress={() => void Linking.openSettings()}
            style={({ pressed }) => [
              primaryButton,
              { alignItems: "center", justifyContent: "center", minHeight: 42, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "700" }}>
              Open phone settings
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pushEnabled ? "Turn off operating-system notifications" : "Enable operating-system notifications"}
            disabled={pushActionPending || pushSettingsQuery.isLoading}
            onPress={() => void (pushEnabled ? turnOffPushNotifications() : enablePushNotifications())}
            style={({ pressed }) => [
              primaryButton,
              {
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                justifyContent: "center",
                minHeight: 42,
                opacity: pushActionPending || pushSettingsQuery.isLoading ? 0.55 : pressed ? 0.82 : 1,
              },
            ]}
          >
            {pushActionPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name={pushEnabled ? "bell-off" : "bell"} size={14} color={colors.primaryForeground} />
            )}
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "700" }}>
              {pushEnabled ? "Turn off push notifications" : "Enable push notifications"}
            </Text>
          </Pressable>
        )}
        {pushFeedback ? (
          <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            {pushFeedback}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading your notifications…</Text>
        </View>
      ) : hasError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading notifications"
          onPress={() => {
            void friendNotificationsQuery.refetch();
            void feedNotificationsQuery.refetch();
            if (isParticipant) void dashboard.refetch();
          }}
          style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 16 }]}
        >
          <Feather name="refresh-cw" size={16} color={colors.primary} />
          <Text style={{ color: colors.foreground, flex: 1, fontSize: 13, lineHeight: 18 }}>
            Notifications couldn’t load. Tap to retry.
          </Text>
        </Pressable>
      ) : notifications.length === 0 ? (
        <View style={[cardStyle, { alignItems: "center", gap: 6, padding: 16 }]}>
          <View style={{ alignItems: "center", backgroundColor: colors.primary + "12", borderRadius: 12, height: 36, justifyContent: "center", width: 36 }}>
            <Feather name="bell" size={17} color={colors.primary} />
          </View>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", textAlign: "center" }}>
            You’re all caught up
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
            New requests, community updates, and check-ins will appear here.
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
              Open My Connections
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
            const checkIn =
              notification.source === "accountability" ? notification.checkIn : null;
            const canConfirmCheckIn =
              checkIn !== null &&
              dashboard.data?.activePartner !== null &&
              checkIn.status === "completed" &&
              checkIn.verificationStatus === "self_reported" &&
              notification.actor.id !== user?.id;
            return (
              <View
                key={`${notification.source}-${notification.id}`}
                testID={`notification-${notification.source}-${notification.id}`}
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
                {notification.source === "friend" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={notification.type === "friend_request" ? "Review friend request" : "Open friends"}
                    onPress={() => {
                      if (notification.isUnread) {
                        void markFriendRead
                          .mutateAsync({ notificationId: notification.id })
                          .catch((error) => setFeedback(errorMessage(error)));
                      }
                      onOpenFriends();
                    }}
                    style={({ pressed }) => [
                      primaryButton,
                      { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                    ]}
                  >
                    <Feather name={notification.type === "friend_request" ? "user-plus" : "users"} size={13} color={colors.primaryForeground} />
                    <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                      {notification.type === "friend_request" ? "Review request" : "Open friends"}
                    </Text>
                  </Pressable>
                ) : null}
                {notification.source === "accountability" && notification.type === "partner_invite" ? (
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
                {notification.source === "community" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${notification.communityTitle} community updates`}
                    onPress={() => {
                      if (notification.isUnread) {
                        void markFeedRead
                          .mutateAsync({ notificationId: notification.id })
                          .catch((error) => setFeedback(errorMessage(error)));
                      }
                      onOpenCommunityFeed();
                    }}
                    style={({ pressed }) => [
                      primaryButton,
                      { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6, opacity: pressed ? 0.8 : 1, paddingHorizontal: 10, paddingVertical: 8 },
                    ]}
                  >
                    <Feather name="message-square" size={13} color={colors.primaryForeground} />
                    <Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: "700" }}>
                      Open community feed
                    </Text>
                  </Pressable>
                ) : null}
                {canConfirmCheckIn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${notification.actor.name}'s check-in`}
                    disabled={confirmCheckIn.isPending}
                    onPress={() => {
                      if (!checkIn) return;
                      void runAction(
                        () => confirmCheckIn.mutateAsync({ checkInId: checkIn.id }),
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
                    disabled={markRead.isPending || markFriendRead.isPending || markFeedRead.isPending}
                    onPress={() => {
                      void runAction(
                        () =>
                          notification.source === "friend"
                            ? markFriendRead.mutateAsync({ notificationId: notification.id })
                            : notification.source === "community"
                              ? markFeedRead.mutateAsync({ notificationId: notification.id })
                              : markRead.mutateAsync({ notificationId: notification.id }),
                        "Notification marked as read.",
                      );
                    }}
                    style={{ alignSelf: "flex-start", paddingVertical: 3 }}
                  >
                    {markRead.isPending || markFriendRead.isPending || markFeedRead.isPending ? (
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