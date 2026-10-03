import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListOrganisationPartnershipsQueryKey,
  useAcceptOrganisationPartnership,
  useCreateOrganisationPartnership,
  useDeclineOrganisationPartnership,
  useEndOrganisationPartnership,
  useListOrganisationPartnerships,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

type Feedback = { message: string; tone: "success" | "error" };

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const message = (error as { data?: { message?: unknown } }).data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function OrganisationPartnershipsSection() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const enabled = user?.userType === "organisation";
  const partnerships = useListOrganisationPartnerships({
    query: {
      queryKey: [...getListOrganisationPartnershipsQueryKey(), user?.id],
      enabled,
      refetchInterval: 15_000,
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: getListOrganisationPartnershipsQueryKey(),
    });
  };
  const mutationOptions = { onSuccess: refresh };
  const create = useCreateOrganisationPartnership({ mutation: mutationOptions });
  const accept = useAcceptOrganisationPartnership({ mutation: mutationOptions });
  const decline = useDeclineOrganisationPartnership({ mutation: mutationOptions });
  const end = useEndOrganisationPartnership({ mutation: mutationOptions });
  const [username, setUsername] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmEndId, setConfirmEndId] = useState<number | null>(null);
  const busy = create.isPending || accept.isPending || decline.isPending || end.isPending;
  const items = partnerships.data ?? [];
  const incoming = items.filter(
    (item) => item.status === "pending" && item.direction === "incoming",
  );
  const outgoing = items.filter(
    (item) => item.status === "pending" && item.direction === "outgoing",
  );
  const active = items.filter((item) => item.status === "active");

  const runAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    fallbackMessage: string,
  ) => {
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

  const sendRequest = () => {
    const normalizedUsername = username.trim().replace(/^@+/, "");
    if (!normalizedUsername || busy) return;
    void runAction(
      async () => {
        await create.mutateAsync({ data: { username: normalizedUsername } });
        setUsername("");
      },
      "Partnership request sent.",
      "That partnership request could not be sent. Please try again.",
    );
  };

  const respond = (partnershipId: number, action: "accept" | "decline") => {
    const mutation = action === "accept" ? accept : decline;
    void runAction(
      () => mutation.mutateAsync({ partnershipId }),
      action === "accept" ? "Partnership accepted." : "Partnership request declined.",
      "That partnership request could not be updated. Please try again.",
    );
  };

  const endPartnership = (partnershipId: number) => {
    void runAction(
      () => end.mutateAsync({ partnershipId }),
      "Partnership ended.",
      "That partnership could not be ended. Please try again.",
    ).then((succeeded) => {
      if (succeeded) setConfirmEndId(null);
    });
  };

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: colors.radius,
    borderWidth: 1,
  } as const;
  const quietButtonStyle = {
    alignItems: "center",
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: colors.radius - 4,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  } as const;

  if (!enabled) return null;

  return (
    <View testID="organisation-partnerships" style={{ gap: 14, marginBottom: 18 }}>
      <View style={{ gap: 6, marginTop: 6 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Feather name="briefcase" size={18} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}>
            Organisation partnerships
          </Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>
          Request partnerships with other organisation profiles. These stay separate from friend connections and participant accountability.
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

      <View style={[cardStyle, { gap: 11, padding: 14 }]}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
          Request a partnership
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          Enter another organisation profile’s username. You do not need to be friends first.
        </Text>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.background,
            borderColor: colors.border,
            borderRadius: colors.radius - 4,
            borderWidth: 1,
            flexDirection: "row",
            gap: 8,
            paddingHorizontal: 11,
          }}
        >
          <Feather name="at-sign" size={15} color={colors.mutedForeground} />
          <TextInput
            testID="organisation-partnership-username"
            accessibilityLabel="Organisation profile username"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            onSubmitEditing={sendRequest}
            placeholder="username"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="send"
            style={{ color: colors.foreground, flex: 1, fontSize: 14, minHeight: 42 }}
            value={username}
          />
        </View>
        <Pressable
          testID="organisation-partnership-send"
          accessibilityRole="button"
          accessibilityLabel="Send organisation partnership request"
          accessibilityState={{ disabled: !username.trim() || busy }}
          disabled={!username.trim() || busy}
          onPress={sendRequest}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: colors.primary,
            borderRadius: colors.radius - 4,
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            minHeight: 42,
            opacity: !username.trim() || busy ? 0.55 : pressed ? 0.8 : 1,
          })}
        >
          {create.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="send" size={14} color={colors.primaryForeground} />
          )}
          <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "600" }}>
            {create.isPending ? "Sending…" : "Send request"}
          </Text>
        </Pressable>
      </View>

      {partnerships.isLoading ? (
        <View style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }]}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Loading organisation partnerships…
          </Text>
        </View>
      ) : partnerships.isError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading organisation partnerships"
          onPress={() => void partnerships.refetch()}
          style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }]}
        >
          <Feather name="refresh-cw" size={16} color={colors.primary} />
          <Text style={{ color: colors.foreground, flex: 1, fontSize: 13 }}>
            Partnerships couldn’t load. Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      {!partnerships.isLoading && !partnerships.isError && incoming.length > 0 ? (
        <View style={[cardStyle, { gap: 12, padding: 14 }]}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Incoming requests
          </Text>
          {incoming.map((item) => (
            <View
              key={item.id}
              testID={`organisation-partnership-incoming-${item.id}`}
              style={{
                backgroundColor: colors.background,
                borderRadius: colors.radius - 4,
                gap: 10,
                padding: 11,
              }}
            >
              <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
                <UserAvatar
                  avatarUrl={item.partner.avatarUrl}
                  name={item.partner.name}
                  containerStyle={{ alignItems: "center", backgroundColor: colors.primary + "12", borderRadius: 20, height: 40, justifyContent: "center", width: 40 }}
                  initialStyle={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                    {item.partner.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    {item.partner.username ? `@${item.partner.username}` : "Organisation profile"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Decline partnership request from ${item.partner.name}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => respond(item.id, "decline")}
                  style={({ pressed }) => [
                    quietButtonStyle,
                    { flex: 1, opacity: busy ? 0.55 : pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                    Decline
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Accept partnership request from ${item.partner.name}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => respond(item.id, "accept")}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius - 4,
                    flex: 1,
                    justifyContent: "center",
                    minHeight: 40,
                    opacity: busy ? 0.55 : pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "600" }}>
                    Accept
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!partnerships.isLoading && !partnerships.isError && outgoing.length > 0 ? (
        <View style={[cardStyle, { gap: 12, padding: 14 }]}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Requests sent
          </Text>
          {outgoing.map((item) => (
            <View key={item.id} style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, flexDirection: "row", gap: 10, padding: 11 }}>
              <UserAvatar
                avatarUrl={item.partner.avatarUrl}
                name={item.partner.name}
                containerStyle={{ alignItems: "center", backgroundColor: colors.secondary + "18", borderRadius: 20, height: 38, justifyContent: "center", width: 38 }}
                initialStyle={{ color: colors.secondary, fontSize: 13, fontWeight: "700" }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                  {item.partner.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  Waiting for a reply
                </Text>
              </View>
              <Feather name="clock" size={15} color={colors.secondary} />
            </View>
          ))}
        </View>
      ) : null}

      {!partnerships.isLoading && !partnerships.isError && active.length > 0 ? (
        <View style={[cardStyle, { gap: 12, padding: 14 }]}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Active partnerships
          </Text>
          {active.map((item) => (
            <View
              key={item.id}
              testID={`organisation-partnership-active-${item.id}`}
              style={{ alignItems: "center", backgroundColor: colors.background, borderRadius: colors.radius - 4, flexDirection: "row", gap: 10, padding: 11 }}
            >
              <UserAvatar
                avatarUrl={item.partner.avatarUrl}
                name={item.partner.name}
                containerStyle={{ alignItems: "center", backgroundColor: colors.success + "12", borderRadius: 20, height: 40, justifyContent: "center", width: 40 }}
                initialStyle={{ color: colors.success, fontSize: 14, fontWeight: "700" }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                  {item.partner.name}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {item.partner.username ? `@${item.partner.username}` : "Organisation profile"}
                </Text>
              </View>
              {confirmEndId === item.id ? (
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                    End partnership?
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Keep partnership"
                      disabled={busy}
                      onPress={() => setConfirmEndId(null)}
                      style={{ paddingHorizontal: 7, paddingVertical: 6 }}
                    >
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
                        Keep
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm ending partnership with ${item.partner.name}`}
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() => endPartnership(item.id)}
                      style={{ paddingHorizontal: 7, paddingVertical: 6 }}
                    >
                      {end.isPending ? (
                        <ActivityIndicator size="small" color={colors.destructive} />
                      ) : (
                        <Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "700" }}>
                          End
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`End partnership with ${item.partner.name}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => setConfirmEndId(item.id)}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    borderColor: colors.border,
                    borderRadius: colors.radius - 4,
                    borderWidth: 1,
                    justifyContent: "center",
                    minHeight: 38,
                    minWidth: 62,
                    opacity: busy ? 0.55 : pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
                    End
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {!partnerships.isLoading &&
      !partnerships.isError &&
      incoming.length === 0 &&
      outgoing.length === 0 &&
      active.length === 0 ? (
        <View style={[cardStyle, { alignItems: "center", flexDirection: "row", gap: 10, padding: 14 }]}>
          <Feather name="briefcase" size={17} color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, flex: 1, fontSize: 13, lineHeight: 19 }}>
            No partnership requests or active partnerships yet.
          </Text>
        </View>
      ) : null}
    </View>
  );
}