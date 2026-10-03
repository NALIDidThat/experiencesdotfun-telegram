import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getGetProfilePostsQueryKey,
  useGetProfilePosts,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

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

export function ProfilePosts({ profileId }: { profileId: number }) {
  const colors = useColors();
  const posts = useGetProfilePosts(profileId, {
    query: {
      queryKey: getGetProfilePostsQueryKey(profileId),
      enabled: Number.isSafeInteger(profileId) && profileId > 0,
      staleTime: 30_000,
    },
  });

  return (
    <View testID="profile-posts" style={styles.section}>
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
            Posts couldn’t be loaded.
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
      ) : posts.data?.items.length ? (
        <View style={styles.postList}>
          {posts.data.items.map((item) => {
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
                    <Text style={[styles.kindText, { color: colors.primary }]}>{kind}</Text>
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
        </View>
      ) : (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <Feather name="edit-3" size={19} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            No posts to show yet.
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
  stateText: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryButton: { paddingHorizontal: 7, paddingVertical: 5 },
  retryText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});