import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetFeedPreferencesQueryKey,
  getGetFeedQueryKey,
  getListFeedCommentsQueryKey,
  getFeed,
  useCreateFeedComment,
  useCreateFeedPost,
  useDeleteFeedComment,
  useGetFeed,
  useGetFeedPreferences,
  useListFeedComments,
  useRemoveFeedReaction,
  useSetFeedReaction,
  useUpdateFeedPreferences,
  type FeedComment,
  type FeedItem,
  type FeedResponse,
} from "@workspace/api-client-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";

type FeedMode = "for-you" | "following" | "local";
type PostKind = "goal" | "doing" | "thought";
type PostVisibility = "friends" | "public" | "private";

type SocialFeedProps = {
  currentUserId: number;
  refreshSignal?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
  onOpenExperience: (experienceId: number) => void;
  onOpenFriend: (friendId: number) => void;
  onOpenSelf: () => void;
  onOpenFriends: () => void;
  onOpenProfile: () => void;
  onOpenExplore: () => void;
};

const pageSize = 20;
const modes: Array<{ id: FeedMode; label: string }> = [
  { id: "for-you", label: "For you" },
  { id: "following", label: "Following" },
  { id: "local", label: "Local" },
];

const kindLabels: Record<PostKind, string> = {
  goal: "Goal",
  doing: "Doing",
  thought: "Thought",
};

const visibilityLabels: Record<PostVisibility, string> = {
  friends: "Friends",
  public: "Everyone",
  private: "Only me",
};

function dateValue(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function relativeTime(value: string | Date): string {
  const elapsed = Math.max(0, Date.now() - dateValue(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateValue(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function eventIcon(type: FeedItem["type"]): keyof typeof Feather.glyphMap {
  if (type === "experience_published") return "calendar";
  if (type === "experience_joined") return "map-pin";
  if (type === "experience_verified") return "check-circle";
  if (type === "xp_earned") return "zap";
  if (type === "achievement_unlocked") return "award";
  if (type === "accountability_goal_completed") return "flag";
  if (type === "accountability_checkin") return "activity";
  return "edit-3";
}

export function SocialFeed({
  currentUserId,
  refreshSignal = 0,
  onRefreshingChange,
  onOpenExperience,
  onOpenFriend,
  onOpenSelf,
  onOpenFriends,
  onOpenProfile,
  onOpenExplore,
}: SocialFeedProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<FeedMode>("for-you");
  const [composerOpen, setComposerOpen] = useState(false);
  const [postKind, setPostKind] = useState<PostKind>("thought");
  const [visibility, setVisibility] = useState<PostVisibility>("friends");
  const [postBody, setPostBody] = useState("");
  const [composerError, setComposerError] = useState("");
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState("");
  const [extraPages, setExtraPages] = useState<FeedResponse[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const pageRequestGeneration = useRef(0);

  const feedParams = { mode, limit: pageSize };
  const feedQuery = useGetFeed(feedParams, {
    query: {
      queryKey: getGetFeedQueryKey(feedParams),
      staleTime: 30_000,
    },
  });
  const preferencesQuery = useGetFeedPreferences({
    query: {
      queryKey: getGetFeedPreferencesQueryKey(),
      staleTime: 30_000,
    },
  });
  const commentsQuery = useListFeedComments(selectedItem?.id ?? 0, {
    query: {
      queryKey: getListFeedCommentsQueryKey(selectedItem?.id ?? 0),
      enabled: selectedItem !== null,
    },
  });

  const resetPagination = useCallback(() => {
    pageRequestGeneration.current += 1;
    setExtraPages([]);
    setLoadingMore(false);
    setLoadMoreError(false);
  }, []);

  const invalidateFeed = useCallback(() => {
    resetPagination();
    return queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
  }, [queryClient, resetPagination]);

  useEffect(() => {
    if (refreshSignal > 0) {
      resetPagination();
      void feedQuery.refetch();
    }
  }, [refreshSignal, feedQuery.refetch, resetPagination]);

  useEffect(() => {
    onRefreshingChange?.(feedQuery.isRefetching);
  }, [feedQuery.isRefetching, onRefreshingChange]);

  useEffect(() => {
    if (!selectedItem) {
      setCommentBody("");
      setCommentError("");
    }
  }, [selectedItem]);

  const feedItems = [
    ...(feedQuery.data?.items ?? []),
    ...extraPages.flatMap((page) => page.items),
  ];
  const preferences = preferencesQuery.data;

  const createPostMutation = useCreateFeedPost();
  const preferenceMutation = useUpdateFeedPreferences();
  const createCommentMutation = useCreateFeedComment();
  const deleteCommentMutation = useDeleteFeedComment();
  const addReactionMutation = useSetFeedReaction();
  const removeReactionMutation = useRemoveFeedReaction();

  const changeMode = (nextMode: FeedMode) => {
    resetPagination();
    setMode(nextMode);
  };

  const loadMore = async () => {
    const lastPage = extraPages.at(-1) ?? feedQuery.data;
    if (!lastPage?.nextCursor || loadingMore) return;
    const generation = pageRequestGeneration.current;
    const requestedMode = mode;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await getFeed({
        mode: requestedMode,
        limit: pageSize,
        cursor: lastPage.nextCursor,
      });
      if (generation === pageRequestGeneration.current) {
        setExtraPages((current) => [...current, page]);
      }
    } catch {
      if (generation === pageRequestGeneration.current) setLoadMoreError(true);
    } finally {
      if (generation === pageRequestGeneration.current) setLoadingMore(false);
    }
  };

  const updateReaction = (itemId: number, reacted: boolean) => {
    const onSettled = () => {
      void invalidateFeed();
    };
    if (reacted) {
      removeReactionMutation.mutate(
        { postId: itemId },
        { onSettled },
      );
    } else {
      addReactionMutation.mutate(
        { postId: itemId, data: { reactionType: "support" } },
        { onSettled },
      );
    }
  };

  const submitPost = async () => {
    const body = postBody.trim();
    if (!body) {
      setComposerError("Write something before sharing.");
      return;
    }
    try {
      await createPostMutation.mutateAsync({
        data: { kind: postKind, body, visibility },
      });
      await invalidateFeed();
      setComposerOpen(false);
      setPostBody("");
      setComposerError("");
      changeMode("for-you");
    } catch {
      setComposerError("Your update couldn’t be shared. Try again.");
    }
  };

  const submitComment = async () => {
    if (!selectedItem || !commentBody.trim()) {
      setCommentError("Write a comment before sending.");
      return;
    }
    createCommentMutation.mutate(
      { postId: selectedItem.id, data: { body: commentBody.trim() } },
      {
        onSuccess: () => {
          setCommentBody("");
          setCommentError("");
          void queryClient.invalidateQueries({
            queryKey: getListFeedCommentsQueryKey(selectedItem.id),
          });
          void invalidateFeed();
        },
        onError: () => setCommentError("Your comment couldn’t be sent. Try again."),
      },
    );
  };

  const emptyMessage = () => {
    if (mode === "following") {
      return {
        title: "Your friends’ activity will show here",
        body: "Add friends to follow their experiences and updates.",
        action: "Find friends",
        onPress: onOpenFriends,
      };
    }
    if (mode === "local" && !feedQuery.data?.city) {
      return {
        title: "Add your city to see local activity",
        body: "Your city helps us find public experiences and updates nearby.",
        action: "Edit profile",
        onPress: onOpenProfile,
      };
    }
    if (mode === "local") {
      return {
        title: "No recent local activity",
        body: "Check back soon, or browse experiences happening near you.",
        action: "Explore",
        onPress: onOpenExplore,
      };
    }
    return {
      title: "Start your community feed",
      body: "Share a goal or update, or join an experience to get started.",
      action: "Share an update",
      onPress: () => setComposerOpen(true),
    };
  };

  const activeEmptyMessage = emptyMessage();

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR COMMUNITY</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Activity feed</Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
            Good things happening around you
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share an update"
          onPress={() => {
            setComposerError("");
            setComposerOpen(true);
          }}
          style={({ pressed }) => [
            styles.composeButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Feather name="plus" size={17} color={colors.primaryForeground} />
          <Text style={[styles.composeButtonText, { color: colors.primaryForeground }]}>
            Share
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.modeControl,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
        accessibilityRole="tablist"
      >
        {modes.map((item) => {
          const selected = mode === item.id;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => changeMode(item.id)}
              style={[
                styles.modeButton,
                selected && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  { color: selected ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.privacyCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={[styles.privacyIcon, { backgroundColor: colors.primary + "14" }]}>
          <Feather name="lock" size={16} color={colors.primary} />
        </View>
        <View style={styles.privacyCopy}>
          <Text style={[styles.privacyTitle, { color: colors.foreground }]}>
            Share activity with friends
          </Text>
          <Text style={[styles.privacyBody, { color: colors.mutedForeground }]}>
            Experience joins, verified completions, XP and accountability check-ins stay private unless you turn this on. Notes are never shared here.
          </Text>
          {preferencesQuery.isError ? (
            <Text style={[styles.inlineError, { color: colors.destructive }]}>
              Privacy settings couldn’t load.
            </Text>
          ) : null}
          {preferenceMutation.isError ? (
            <Text style={[styles.inlineError, { color: colors.destructive }]}>
              Your privacy setting couldn’t be updated.
            </Text>
          ) : null}
        </View>
        <Switch
          accessibilityLabel="Share experience, XP, and accountability activity with friends"
          value={preferences?.shareActivityWithFriends ?? false}
          disabled={preferencesQuery.isLoading || preferenceMutation.isPending}
          onValueChange={(value) =>
            preferenceMutation.mutate(
              { data: { shareActivityWithFriends: value } },
              {
                onSuccess: (updated) => {
                  queryClient.setQueryData(getGetFeedPreferencesQueryKey(), updated);
                  void invalidateFeed();
                },
              },
            )
          }
          trackColor={{ false: colors.border, true: colors.primary + "88" }}
          thumbColor={
            preferences?.shareActivityWithFriends ? colors.primary : colors.card
          }
        />
      </View>

      {feedQuery.isLoading ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Loading community activity…
          </Text>
        </View>
      ) : feedQuery.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="wifi-off" size={24} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            Activity didn’t load
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Your feed is still here. Try again in a moment.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void feedQuery.refetch()}
            style={[styles.stateAction, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.stateActionText, { color: colors.primaryForeground }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : feedItems.length === 0 ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "14" }]}>
            <Feather name="users" size={23} color={colors.primary} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            {activeEmptyMessage.title}
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {activeEmptyMessage.body}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={activeEmptyMessage.onPress}
            style={[styles.stateAction, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.stateActionText, { color: colors.primaryForeground }]}>
              {activeEmptyMessage.action}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.items}>
          {feedItems.map((item) => (
            <FeedCard
              currentUserId={currentUserId}
              item={item}
              key={item.id}
              onOpenComments={() => setSelectedItem(item)}
              onOpenExperience={onOpenExperience}
              onOpenFriend={onOpenFriend}
              onOpenSelf={onOpenSelf}
              onReact={(reacted) => updateReaction(item.id, reacted)}
            />
          ))}
          {Boolean(extraPages.at(-1)?.nextCursor ?? feedQuery.data?.nextCursor) ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => void loadMore()}
              style={[
                styles.loadMoreButton,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  borderRadius: colors.radius,
                },
              ]}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                  {loadMoreError ? "Try loading more again" : "Load more activity"}
                </Text>
              )}
            </Pressable>
          ) : null}
          {addReactionMutation.isError || removeReactionMutation.isError ? (
            <Text style={[styles.inlineError, { color: colors.destructive }]}>
              Your reaction couldn’t be saved. Try again.
            </Text>
          ) : null}
        </View>
      )}

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={[styles.modalScrim, { backgroundColor: colors.foreground + "80" }]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.composerScroll}
            contentContainerStyle={styles.composerScrollContent}
          >
          <View
            style={[
              styles.composerSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderTopLeftRadius: colors.radius + 8,
                borderTopRightRadius: colors.radius + 8,
                paddingBottom: 22 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Share an update
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  Keep it focused on your experience.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close update form"
                onPress={() => setComposerOpen(false)}
                hitSlop={8}
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.choiceRow}>
              {(Object.keys(kindLabels) as PostKind[]).map((kind) => {
                const selected = postKind === kind;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={kind}
                    onPress={() => setPostKind(kind)}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: selected ? colors.primary + "14" : colors.muted,
                        borderColor: "#f20789",
                        borderWidth: 1.5,
                        boxShadow: selected
                          ? "0px 0px 12px rgba(242, 7, 137, 0.55)"
                          : "0px 0px 7px rgba(242, 7, 137, 0.3)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        { color: selected ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {kindLabels[kind]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel="Update text"
              value={postBody}
              onChangeText={(value) => {
                setPostBody(value.slice(0, 500));
                setComposerError("");
              }}
              placeholder={
                postKind === "goal"
                  ? "What are you working toward?"
                  : postKind === "doing"
                    ? "What are you doing today?"
                    : "What’s on your mind?"
              }
              placeholderTextColor={colors.mutedForeground}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={[
                styles.postInput,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            />
            <View style={styles.visibilityHeader}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Who can see this?
              </Text>
              <Text style={[styles.characterCount, { color: colors.mutedForeground }]}>
                {postBody.length}/500
              </Text>
            </View>
            <View style={styles.choiceRow}>
              {(Object.keys(visibilityLabels) as PostVisibility[]).map((item) => {
                const selected = visibility === item;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={item}
                    onPress={() => setVisibility(item)}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: selected ? colors.primary + "14" : colors.muted,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        { color: selected ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {visibilityLabels[item]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {composerError ? (
              <Text style={[styles.inlineError, { color: colors.destructive }]}>
                {composerError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={createPostMutation.isPending}
              onPress={() => void submitPost()}
              style={[
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  borderRadius: colors.radius,
                  opacity: createPostMutation.isPending ? 0.65 : 1,
                },
              ]}
            >
              {createPostMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
                  Share update
                </Text>
              )}
            </Pressable>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={selectedItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={[styles.modalScrim, { backgroundColor: colors.foreground + "80" }]}
        >
          <View
            style={[
              styles.commentsSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderTopLeftRadius: colors.radius + 8,
                borderTopRightRadius: colors.radius + 8,
                paddingBottom: 16 + insets.bottom,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Comments
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>
                  Be kind and keep it constructive.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close comments"
                onPress={() => setSelectedItem(null)}
                hitSlop={8}
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {commentsQuery.isLoading ? (
              <View style={styles.commentState}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : commentsQuery.isError ? (
              <View style={styles.commentState}>
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  Comments couldn’t load.
                </Text>
                <Pressable onPress={() => void commentsQuery.refetch()}>
                  <Text style={[styles.loadMoreText, { color: colors.primary }]}>Try again</Text>
                </Pressable>
              </View>
            ) : (commentsQuery.data?.comments.length ?? 0) === 0 ? (
              <View style={styles.commentState}>
                <Feather name="message-circle" size={24} color={colors.mutedForeground} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  No comments yet. Start the conversation.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.commentList}
                contentContainerStyle={styles.commentListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              >
                {commentsQuery.data?.comments.map((comment) => (
                  <CommentRow
                    comment={comment}
                    key={comment.id}
                    onDelete={() =>
                      deleteCommentMutation.mutate(
                        { commentId: comment.id },
                        {
                          onSuccess: () => {
                            if (selectedItem) {
                              void queryClient.invalidateQueries({
                                queryKey: getListFeedCommentsQueryKey(selectedItem.id),
                              });
                            }
                            void invalidateFeed();
                          },
                        },
                      )
                    }
                    onOpenFriend={onOpenFriend}
                    onOpenSelf={onOpenSelf}
                    currentUserId={currentUserId}
                  />
                ))}
              </ScrollView>
            )}
            {deleteCommentMutation.isError ? (
              <Text style={[styles.inlineError, { color: colors.destructive }]}>
                Your comment couldn’t be deleted.
              </Text>
            ) : null}
            <View
              style={[
                styles.commentComposer,
                { borderTopColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <TextInput
                accessibilityLabel="Write a comment"
                value={commentBody}
                onChangeText={(value) => {
                  setCommentBody(value.slice(0, 280));
                  setCommentError("");
                }}
                placeholder="Write a supportive comment…"
                placeholderTextColor={colors.mutedForeground}
                maxLength={280}
                multiline
                style={[
                  styles.commentInput,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send comment"
                disabled={createCommentMutation.isPending || !commentBody.trim()}
                onPress={() => void submitComment()}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: createCommentMutation.isPending || !commentBody.trim() ? 0.55 : 1,
                  },
                ]}
              >
                {createCommentMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="arrow-up" size={19} color={colors.primaryForeground} />
                )}
              </Pressable>
            </View>
            {commentError ? (
              <Text style={[styles.commentError, { color: colors.destructive }]}>
                {commentError}
              </Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FeedCard({
  item,
  currentUserId,
  onReact,
  onOpenComments,
  onOpenExperience,
  onOpenFriend,
  onOpenSelf,
}: {
  item: FeedItem;
  currentUserId: number;
  onReact: (reacted: boolean) => void;
  onOpenComments: () => void;
  onOpenExperience: (experienceId: number) => void;
  onOpenFriend: (friendId: number) => void;
  onOpenSelf: () => void;
}) {
  const colors = useColors();
  const openActor = () => {
    if (item.actor.id === currentUserId) onOpenSelf();
    else if (item.actor.isFriend) onOpenFriend(item.actor.id);
  };

  return (
    <View
      style={[
        styles.activityCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
      ]}
    >
      <View style={styles.activityHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.actor.name}'s profile`}
          disabled={item.actor.id !== currentUserId && !item.actor.isFriend}
          onPress={openActor}
          style={styles.actorPressable}
        >
          <UserAvatar
            avatarUrl={item.actor.avatarUrl}
            name={item.actor.name}
            containerStyle={[styles.avatar, { backgroundColor: colors.primary + "18" }]}
            initialStyle={[styles.avatarInitial, { color: colors.primary }]}
          />
          <View style={styles.actorText}>
            <Text style={[styles.actorName, { color: colors.foreground }]} numberOfLines={1}>
              {item.actor.name}
            </Text>
            <Text style={[styles.activitySummary, { color: colors.mutedForeground }]} numberOfLines={2}>
              {item.summary}
            </Text>
          </View>
        </Pressable>
        <View style={styles.activityMeta}>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
            {relativeTime(item.createdAt)}
          </Text>
          <View style={[styles.activityTypeIcon, { backgroundColor: colors.primary + "12" }]}>
            <Feather name={eventIcon(item.type)} size={14} color={colors.primary} />
          </View>
        </View>
      </View>

      {item.post ? (
        <View
          style={[
            styles.postBodyCard,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.postKind, { color: colors.primary }]}>
            {kindLabels[item.post.kind as PostKind] ?? "Update"}
          </Text>
          <Text style={[styles.postBody, { color: colors.foreground }]}>
            {item.post.body}
          </Text>
        </View>
      ) : null}

      {item.xpAmount !== null ? (
        <View style={[styles.xpCard, { backgroundColor: colors.primary + "12" }]}>
          <Feather name="zap" size={20} color={colors.primary} />
          <View style={styles.xpCopy}>
            <Text style={[styles.xpAmount, { color: colors.primary }]}>
              +{item.xpAmount} XP earned
            </Text>
            {item.sourceTitle ? (
              <Text style={[styles.xpSource, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.sourceTitle}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {item.experience ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open experience ${item.experience.title}`}
          onPress={() => onOpenExperience(item.experience!.id)}
          style={({ pressed }) => [
            styles.experienceCard,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              borderRadius: colors.radius,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.experienceIcon, { backgroundColor: colors.primary + "14" }]}>
            <Feather name="calendar" size={20} color={colors.primary} />
          </View>
          <View style={styles.experienceCopy}>
            <Text style={[styles.experienceTitle, { color: colors.foreground }]} numberOfLines={2}>
              {item.experience.title}
            </Text>
            <Text style={[styles.experienceMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.experience.organisationName} · {item.experience.city}
            </Text>
            <Text style={[styles.experienceMeta, { color: colors.mutedForeground }]}>
              {item.experience.date} · +{item.experience.xpReward} XP
            </Text>
          </View>
          <Feather name="arrow-up-right" size={17} color={colors.primary} />
        </Pressable>
      ) : null}

      <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.reaction.reacted ? "Remove support" : "Support update"}
          accessibilityState={{ selected: item.reaction.reacted }}
          onPress={() => onReact(item.reaction.reacted)}
          style={styles.actionButton}
        >
          <Feather
            name={item.reaction.reacted ? "heart" : "heart"}
            size={17}
            color={item.reaction.reacted ? colors.primary : colors.mutedForeground}
          />
          <Text
            style={[
              styles.actionText,
              { color: item.reaction.reacted ? colors.primary : colors.mutedForeground },
            ]}
          >
            {item.reaction.reacted ? "Supported" : "Support"}
          </Text>
          {item.reaction.count ? (
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
              {item.reaction.count}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${item.commentCount} comments`}
          onPress={onOpenComments}
          style={styles.actionButton}
        >
          <Feather name="message-circle" size={17} color={colors.mutedForeground} />
          <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Comment</Text>
          {item.commentCount ? (
            <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>
              {item.commentCount}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onDelete,
  onOpenFriend,
  onOpenSelf,
}: {
  comment: FeedComment;
  currentUserId: number;
  onDelete: () => void;
  onOpenFriend: (friendId: number) => void;
  onOpenSelf: () => void;
}) {
  const colors = useColors();
  const openActor = () => {
    if (comment.actor.id === currentUserId) onOpenSelf();
    else if (comment.actor.isFriend) onOpenFriend(comment.actor.id);
  };

  return (
    <View style={styles.commentRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${comment.actor.name}'s profile`}
        disabled={comment.actor.id !== currentUserId && !comment.actor.isFriend}
        onPress={openActor}
      >
        <UserAvatar
          avatarUrl={comment.actor.avatarUrl}
          name={comment.actor.name}
          containerStyle={[styles.commentAvatar, { backgroundColor: colors.primary + "18" }]}
          initialStyle={[styles.commentAvatarInitial, { color: colors.primary }]}
        />
      </Pressable>
      <View style={styles.commentCopy}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentName, { color: colors.foreground }]} numberOfLines={1}>
            {comment.actor.name}
          </Text>
          <Text style={[styles.timeText, { color: colors.mutedForeground }]}>
            {relativeTime(comment.createdAt)}
          </Text>
        </View>
        <Text style={[styles.commentText, { color: colors.foreground }]}>{comment.body}</Text>
        {comment.canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete your comment"
            onPress={onDelete}
            style={styles.deleteComment}
          >
            <Text style={[styles.deleteCommentText, { color: colors.destructive }]}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14, marginTop: 24 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontFamily: "Inter_700Bold" },
  heading: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold" },
  subheading: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  composeButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  composeButtonText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  modeControl: { flexDirection: "row", padding: 4, borderWidth: 1, borderRadius: 16, gap: 4 },
  modeButton: { flex: 1, minHeight: 38, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  modeButtonText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  privacyCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderWidth: 1, borderRadius: 18 },
  privacyIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  privacyCopy: { flex: 1, gap: 3 },
  privacyTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  privacyBody: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular" },
  items: { gap: 12 },
  activityCard: { borderWidth: 1, borderRadius: 22, padding: 14, gap: 12 },
  activityHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actorPressable: { flexDirection: "row", alignItems: "center", flex: 1, gap: 10, minWidth: 0 },
  avatar: { width: 42, height: 42, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  avatarInitial: { fontSize: 16, fontFamily: "Inter_700Bold" },
  actorText: { flex: 1, gap: 2 },
  actorName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  activitySummary: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  activityMeta: { alignItems: "flex-end", gap: 7 },
  timeText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  activityTypeIcon: { width: 27, height: 27, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  postBodyCard: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 6 },
  postKind: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: "Inter_700Bold" },
  postBody: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  xpCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 15 },
  xpCopy: { flex: 1, gap: 2 },
  xpAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  xpSource: { fontSize: 12, fontFamily: "Inter_400Regular" },
  experienceCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderRadius: 16 },
  experienceIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: "center", alignItems: "center" },
  experienceCopy: { flex: 1, gap: 3 },
  experienceTitle: { fontSize: 13, lineHeight: 17, fontFamily: "Inter_700Bold" },
  experienceMeta: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 16 },
  actionButton: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actionCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stateCard: { minHeight: 160, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", padding: 20, gap: 9 },
  stateTitle: { fontSize: 15, textAlign: "center", fontFamily: "Inter_700Bold" },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: "center", fontFamily: "Inter_400Regular" },
  stateAction: { minHeight: 38, paddingHorizontal: 15, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 3 },
  stateActionText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  emptyIcon: { width: 43, height: 43, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  loadMoreButton: { minHeight: 42, borderWidth: 1, borderRadius: 15, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 },
  loadMoreText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  modalScrim: { flex: 1, justifyContent: "flex-end" },
  composerScroll: { maxHeight: "94%", flexGrow: 0 },
  composerScrollContent: { justifyContent: "flex-end" },
  composerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, gap: 13 },
  commentsSheet: { height: "76%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  sheetHandle: { width: 38, height: 4, borderRadius: 3, alignSelf: "center", marginBottom: 5 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 3, fontFamily: "Inter_400Regular" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choiceChip: { minHeight: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  choiceText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  postInput: { minHeight: 124, maxHeight: 200, borderWidth: 1, borderRadius: 16, padding: 13, fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  visibilityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  characterCount: { fontSize: 11, fontFamily: "Inter_400Regular" },
  inlineError: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_600SemiBold" },
  submitButton: { minHeight: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  submitButtonText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  commentState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 11, padding: 18 },
  commentList: { flex: 1, marginTop: 10 },
  commentListContent: { gap: 15, paddingVertical: 12 },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  commentAvatar: { width: 32, height: 32, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  commentAvatarInitial: { fontSize: 12, fontFamily: "Inter_700Bold" },
  commentCopy: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  commentName: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold" },
  commentText: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  deleteComment: { alignSelf: "flex-start", paddingVertical: 3 },
  deleteCommentText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  commentComposer: { flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
  commentInput: { flex: 1, minHeight: 42, maxHeight: 96, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular" },
  sendButton: { width: 40, height: 40, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  commentError: { fontSize: 11, marginTop: 6, fontFamily: "Inter_600SemiBold" },
});