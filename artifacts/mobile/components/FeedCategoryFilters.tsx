import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FeedPostCategory, FeedPostTopic } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export const feedCategoryLabels: Record<FeedPostCategory, string> = {
  personal: "Personal",
  professional: "Professional",
};

export const feedTopicLabels: Record<FeedPostTopic, string> = {
  general: "General",
  goals: "Goals",
  reflections: "Reflections",
  experiences: "Experiences",
  community: "Community",
  career: "Career",
  skills: "Skills",
  learning: "Learning",
  networking: "Networking",
  projects: "Projects",
};

export const feedTopicsByCategory: Record<FeedPostCategory, FeedPostTopic[]> = {
  personal: ["general", "goals", "reflections", "experiences", "community"],
  professional: ["general", "career", "skills", "learning", "networking", "projects"],
};

export function FeedCategoryFilters({
  category,
  topic,
  onCategoryChange,
  onTopicChange,
  testIDPrefix = "feed",
  showAllTopics = true,
}: {
  category: FeedPostCategory;
  topic: FeedPostTopic | null;
  onCategoryChange: (category: FeedPostCategory) => void;
  onTopicChange: (topic: FeedPostTopic | null) => void;
  testIDPrefix?: string;
  showAllTopics?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View
        accessibilityRole="tablist"
        style={[
          styles.categoryControl,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        ]}
      >
        {(Object.keys(feedCategoryLabels) as FeedPostCategory[]).map((item) => {
          const selected = category === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              testID={`${testIDPrefix}-category-${item}`}
              onPress={() => onCategoryChange(item)}
              style={[
                styles.categoryButton,
                selected && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: selected ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {feedCategoryLabels[item]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topicRow}
        keyboardShouldPersistTaps="handled"
      >
        {showAllTopics ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: topic === null }}
            testID={`${testIDPrefix}-topic-all`}
            onPress={() => onTopicChange(null)}
            style={[
              styles.topicChip,
              {
                backgroundColor: topic === null ? colors.primary + "14" : colors.card,
                borderColor: topic === null ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.topicText, { color: topic === null ? colors.primary : colors.mutedForeground }]}>
              All topics
            </Text>
          </Pressable>
        ) : null}
        {feedTopicsByCategory[category].map((item) => {
          const selected = topic === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`${testIDPrefix}-topic-${item}`}
              onPress={() => onTopicChange(item)}
              style={[
                styles.topicChip,
                {
                  backgroundColor: selected ? colors.primary + "14" : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.topicText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                {feedTopicLabels[item]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  categoryControl: { flexDirection: "row", borderWidth: 1, padding: 3 },
  categoryButton: { flex: 1, minHeight: 39, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  categoryText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  topicRow: { flexDirection: "row", gap: 7, paddingVertical: 1, paddingRight: 4 },
  topicChip: { minHeight: 32, justifyContent: "center", borderWidth: 1, borderRadius: 99, paddingHorizontal: 12 },
  topicText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
