import { Pressable, StyleSheet, View } from "react-native";
import { PoppinsText as Text } from "@/components/Typography";
import type { FeedPostCategory } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export const feedCategoryLabels: Record<FeedPostCategory, string> = {
  personal: "Personal",
  professional: "Professional",
};

export function FeedCategoryFilters({
  category,
  onCategoryChange,
  testIDPrefix = "feed",
}: {
  category: FeedPostCategory;
  onCategoryChange: (category: FeedPostCategory) => void;
  testIDPrefix?: string;
}) {
  const colors = useColors();

  return (
    <View
      testID={`${testIDPrefix}-category-tabs`}
      style={[styles.filterTrack, { backgroundColor: colors.muted }]}
    >
      <View
        accessibilityRole="tablist"
        style={styles.categoryControl}
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
              style={({ pressed }) => [
                styles.categoryButton,
                selected && {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                },
                pressed && styles.categoryButtonPressed,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  {
                    color: selected ? colors.foreground : colors.mutedForeground,
                    fontFamily: selected ? "Inter_700Bold" : "Inter_600SemiBold",
                  },
                ]}
              >
                {feedCategoryLabels[item]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterTrack: {
    width: "100%",
    maxWidth: 276,
    minHeight: 44,
    alignSelf: "center",
    borderRadius: 12,
    overflow: "hidden",
  },
  categoryControl: { flexDirection: "row" },
  categoryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  categoryButtonPressed: { opacity: 0.78 },
  categoryText: { fontSize: 12.5 },
});
