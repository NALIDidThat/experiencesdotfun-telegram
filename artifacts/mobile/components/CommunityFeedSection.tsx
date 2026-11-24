import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  View,
} from "react-native";
import { PoppinsText as Text, PoppinsTextInput as TextInput } from "@/components/Typography";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCommunityFeedQueryKey,
  getGetFeedQueryKey,
  getListHostExperiencesQueryKey,
  useCreateFeedPost,
  useGetCommunityFeed,
  useListHostExperiences,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export function CommunityFeedSection({ chatId }: { chatId: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [broadcastToTelegram, setBroadcastToTelegram] = useState(false);
  const [selectedExperienceId, setSelectedExperienceId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const feedQuery = useGetCommunityFeed(chatId, {
    query: {
      queryKey: getGetCommunityFeedQueryKey(chatId),
      refetchInterval: 30_000,
      retry: 1,
    },
  });
  const hostExperiences = useListHostExperiences({
    query: {
      queryKey: getListHostExperiencesQueryKey(),
      enabled: feedQuery.data?.canBroadcastToTelegram === true,
      retry: 1,
    },
  });
  const createPost = useCreateFeedPost();
  const updates = feedQuery.data?.items ?? [];
  const upcomingExperiences = (hostExperiences.data ?? []).filter((experience) =>
    experience.status === "published" && experience.date >= new Date().toISOString().slice(0, 10),
  );

  const draftExperienceAnnouncement = (experience: (typeof upcomingExperiences)[number]) => {
    const titleLine = `Upcoming experience: ${experience.title}`;
    const details = `${experience.date} · ${experience.startTime} · ${experience.city}`;
    const location = experience.location.trim();
    const prefix = [titleLine, details, location].filter(Boolean).join("\n");
    const description = experience.description.trim();
    const remaining = Math.max(0, 500 - prefix.length - (description ? 2 : 0));
    setBody(description ? `${prefix}\n\n${description.slice(0, remaining)}`.slice(0, 500) : prefix.slice(0, 500));
    setSelectedExperienceId(experience.id);
    setFeedback("Experience details added to the draft. Review the text before sharing.");
    setFeedbackIsError(false);
  };

  const submit = async () => {
    const message = body.trim();
    if (!message) {
      setFeedback("Write an update before sharing.");
      setFeedbackIsError(true);
      return;
    }
    setFeedback("");
    setFeedbackIsError(false);
    try {
      const result = await createPost.mutateAsync({
        data: {
          kind: "thought",
          body: message,
          visibility: "community",
          communityChatId: chatId,
          broadcastToTelegram:
            broadcastToTelegram && feedQuery.data?.canBroadcastToTelegram === true,
        },
      });
      setBody("");
      setBroadcastToTelegram(false);
      setSelectedExperienceId(null);
      setFeedback(
        result.telegramBroadcastStatus === "sent"
          ? "Update shared with the community and posted in Telegram."
          : result.telegramBroadcastStatus === "failed"
            ? "Update shared with members, but Telegram could not deliver it."
            : "Update shared with community members.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetCommunityFeedQueryKey(chatId) }),
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() }),
      ]);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "data" in error &&
        typeof error.data === "object" &&
        error.data !== null &&
        "message" in error.data &&
        typeof error.data.message === "string"
          ? error.data.message
          : "The update could not be shared. Try again.";
      setFeedback(message);
      setFeedbackIsError(true);
    }
  };

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: colors.radius,
        borderWidth: 1,
        gap: 12,
        padding: 14,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 9 }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.primary + "14",
            borderRadius: 11,
            height: 32,
            justifyContent: "center",
            width: 32,
          }}
        >
          <Feather name="message-square" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
            Community updates
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
            Shared only with verified members of this group.
          </Text>
        </View>
      </View>

      <TextInput
        accessibilityLabel="Write a community update"
        value={body}
        onChangeText={(value) => {
          setBody(value.slice(0, 500));
          if (feedbackIsError) setFeedback("");
        }}
        maxLength={500}
        multiline
        placeholder="Share a community update…"
        placeholderTextColor={colors.mutedForeground}
        textAlignVertical="top"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: colors.radius - 4,
          borderWidth: 1,
          color: colors.foreground,
          minHeight: 82,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />
      {feedQuery.data?.canBroadcastToTelegram ? (
        <View style={{ gap: 7 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
            Curated experience announcements
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            Choose a published upcoming experience to draft an announcement. Review and edit it, then enable Telegram delivery if wanted.
          </Text>
          {hostExperiences.isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : hostExperiences.isError ? (
            <Pressable onPress={() => void hostExperiences.refetch()}>
              <Text style={{ color: colors.destructive, fontSize: 11 }}>Experiences could not load. Tap to retry.</Text>
            </Pressable>
          ) : upcomingExperiences.length ? (
            <View style={{ gap: 6 }}>
              {upcomingExperiences.slice(0, 5).map((experience) => {
                const selected = selectedExperienceId === experience.id;
                return (
                  <Pressable
                    key={experience.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Draft an announcement for ${experience.title}`}
                    testID={`community-announcement-experience-${experience.id}`}
                    onPress={() => draftExperienceAnnouncement(experience)}
                    style={({ pressed }) => ({
                      backgroundColor: selected ? colors.primary + "12" : colors.background,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: colors.radius - 5,
                      borderWidth: 1,
                      opacity: pressed ? 0.76 : 1,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    })}
                  >
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
                      {experience.title}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 3 }}>
                      {experience.date} · {experience.city}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              No published upcoming experiences are available to announce.
            </Text>
          )}
        </View>
      ) : null}
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{body.length}/500</Text>
        {feedQuery.data?.canBroadcastToTelegram ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
            <Text style={{ color: colors.foreground, fontSize: 11 }}>Post in Telegram too</Text>
            <Switch
              accessibilityLabel="Also send this update to the Telegram group"
              value={broadcastToTelegram}
              onValueChange={setBroadcastToTelegram}
              trackColor={{ false: colors.border, true: colors.primary + "88" }}
              thumbColor={broadcastToTelegram ? colors.primary : colors.card}
            />
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share community update"
        disabled={createPost.isPending || !body.trim()}
        onPress={() => void submit()}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: colors.primary,
          borderRadius: colors.radius - 5,
          flexDirection: "row",
          gap: 7,
          justifyContent: "center",
          minHeight: 42,
          opacity: createPost.isPending || !body.trim() ? 0.6 : pressed ? 0.8 : 1,
        })}
      >
        {createPost.isPending ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Feather name="send" size={14} color={colors.primaryForeground} />
        )}
        <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: "700" }}>
          Share update
        </Text>
      </Pressable>
      {feedback ? (
        <Text
          accessibilityRole={feedbackIsError ? "alert" : undefined}
          style={{
            color: feedbackIsError ? colors.destructive : colors.success,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {feedback}
        </Text>
      ) : null}

      {feedQuery.isLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 16 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : feedQuery.isError ? (
        <Pressable onPress={() => void feedQuery.refetch()}>
          <Text style={{ color: colors.destructive, fontSize: 12 }}>
            Updates could not load. Tap to retry.
          </Text>
        </Pressable>
      ) : updates.length === 0 ? (
        <View style={{ alignItems: "flex-start", backgroundColor: colors.muted, borderRadius: colors.radius - 5, flexDirection: "row", gap: 8, padding: 10 }}>
          <Feather name="message-square" size={14} color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, flex: 1, fontSize: 11, lineHeight: 16 }}>
            No updates yet. Share the first one above.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {updates.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: colors.muted,
                borderRadius: colors.radius - 5,
                gap: 5,
                padding: 11,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>
                {item.actor.name} · {item.summary}
              </Text>
              {item.post ? (
                <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
                  {item.post.body}
                </Text>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                {new Date(item.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
