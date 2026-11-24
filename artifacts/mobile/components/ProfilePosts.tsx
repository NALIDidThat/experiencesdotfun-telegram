import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getListProfilePostsQueryKey,
  listProfilePosts,
  useListProfilePosts,
  type FeedPostCategory,
  type ProfilePostsResponse,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { FeedCategoryFilters, feedCategoryLabels } from "@/components/FeedCategoryFilters";

const postKindLabels: Record<string, string> = {
  goal: "Goal",
  doing: "Doing",
  thought: "Thought",
};

const visibilityLabels: Record<string, string> = {
  public: "Everyone",
  friends: "Friends",
  private: "Only me",
};

function requestErrorMessage(error: unknown): string {
  const message = (error as { data?: { message?: unknown } } | null)?.data?.message;
  return typeof message === "string" ? message : "Posts couldn’t be loaded.";
}

function postDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function ProfilePosts({
  profileId,
  category: controlledCategory,
  onCategoryChange,
  showCategoryFilters = true,
}: {
  profileId: number;
  category?: FeedPostCategory;
  onCategoryChange?: (category: FeedPostCategory) => void;
  showCategoryFilters?: boolean;
}) {
  const colors = useColors();
  const [localCategory, setLocalCategory] = useState<FeedPostCategory>("personal");
  const category = controlledCategory ?? localCategory;
  const [extraPages, setExtraPages] = useState<ProfilePostsResponse[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const requestGeneration = useRef(0);
  const params = { profileId, category, limit: 20 };
  const posts = useListProfilePosts(params, {
    query: {
      queryKey: getListProfilePostsQueryKey(params),
      enabled: Number.isSafeInteger(profileId) && profileId > 0,
      staleTime: 30_000,
    },
  });
  useEffect(() => {
    requestGeneration.current += 1;
    setExtraPages([]);
    setLoadingMore(false);
    setLoadMoreError(false);
  }, [category, posts.dataUpdatedAt]);
  const items = [...(posts.data?.items ?? []), ...extraPages.flatMap((page) => page.items)];
  const resetPagination = () => {
    requestGeneration.current += 1;
    setExtraPages([]);
    setLoadingMore(false);
    setLoadMoreError(false);
  };
  const changeCategory = (nextCategory: FeedPostCategory) => {
    if (nextCategory === category) return;
    resetPagination();
    if (controlledCategory === undefined) setLocalCategory(nextCategory);
    else onCategoryChange?.(nextCategory);
  };
  const loadMore = async () => {
    const lastPage = extraPages.at(-1) ?? posts.data;
    if (!lastPage?.nextCursor || loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listProfilePosts({ ...params, cursor: lastPage.nextCursor });
      if (generation === requestGeneration.current) {
        setExtraPages((current) => [...current, page]);
      }
    } catch {
      if (generation === requestGeneration.current) setLoadMoreError(true);
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  };

  return (
    <View testID="profile-posts" style={styles.section}>
      {showCategoryFilters ? (
        <FeedCategoryFilters
          category={category}
          onCategoryChange={changeCategory}
          testIDPrefix="profile-posts"
        />
      ) : null}

      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>Posts</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Updates shared from this profile
          </Text>
        </View>
        <Feather name="message-circle" size={19} color={colors.primary} />
      </View>

      {posts.isLoading ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Loading posts…
          </Text>
        </View>
      ) : posts.isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Text style={[styles.stateText, { color: colors.destructive }]}>
            {requestErrorMessage(posts.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading profile posts"
            testID="profile-posts-retry"
            onPress={() => { void posts.refetch(); }}
            style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length ? (
        <View style={styles.postList}>
          {items.map((item) => {
            if (!item.post) return null;
            const kind = postKindLabels[item.post.kind] ?? "Update";
            const visibility = visibilityLabels[item.visibility] ?? "Shared";
            return (
              <View
                key={item.id}
                style={[
                  styles.postCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <View style={styles.postMetaRow}>
                  <View style={[styles.kindBadge, { backgroundColor: colors.primary + "12" }]}>
                    <Feather name="edit-3" size={13} color={colors.primary} />
                    <Text style={[styles.kindText, { color: colors.primary }]}>
                      {feedCategoryLabels[item.post.category]} · {kind}
                    </Text>
                  </View>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {visibility} · {postDateLabel(item.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {item.post.body}
                </Text>
              </View>
            );
          })}
          {loadMoreError ? (
            <Text style={[styles.stateText, { color: colors.destructive }]}>
              More posts couldn’t be loaded. Try again.
            </Text>
          ) : null}
          {Boolean(extraPages.at(-1)?.nextCursor ?? posts.data?.nextCursor) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={loadMoreError ? "Retry loading more posts" : "Load more posts"}
              testID="profile-posts-load-more"
              disabled={loadingMore}
              onPress={() => void loadMore()}
              style={({ pressed }) => [
                styles.retryButton,
                { opacity: pressed || loadingMore ? 0.65 : 1 },
              ]}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.retryText, { color: colors.primary }]}>
                  {loadMoreError ? "Try again" : "Load more"}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.stateCard, styles.emptyStateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "12" }]}>
            <Feather name="edit-3" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No {feedCategoryLabels[category].toLowerCase()} posts yet
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Posts from this profile will appear here.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginBottom: 24 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingCopy: { flex: 1, gap: 3 },
  title: { fontSize: 19, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  postList: { gap: 10 },
  postCard: { borderWidth: 1, gap: 11, padding: 14 },
  postMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kindBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  kindText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  metaText: { flexShrink: 1, fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "right" },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  stateCard: { minHeight: 74, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderWidth: 1, padding: 15 },
  emptyStateCard: { minHeight: 112, flexDirection: "column", gap: 5, padding: 14 },
  emptyIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  stateText: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryButton: { paddingHorizontal: 7, paddingVertical: 5 },
  retryText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});