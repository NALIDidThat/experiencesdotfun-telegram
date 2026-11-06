import { Pressable, Platform, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
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
  const liquidGlassAvailable =
    Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();

  return (
    <View
      testID={`${testIDPrefix}-category-tabs`}
      style={[
        styles.glassControl,
        {
          backgroundColor: `${colors.primary}08`,
          borderColor: `${colors.primary}48`,
        },
      ]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassBackdrop]}>
        {liquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor={`${colors.primary}24`}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <BlurView intensity={42} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `${colors.primary}12` },
          ]}
        />
      </View>
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
                selected && { backgroundColor: colors.primary },
                pressed && styles.categoryButtonPressed,
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
    </View>
  );
}

const styles = StyleSheet.create({
  glassControl: {
    borderWidth: 1,
    borderRadius: 999,
    overflow: "hidden",
    padding: 4,
    position: "relative",
  },
  glassBackdrop: { borderRadius: 999 },
  categoryControl: { flexDirection: "row", gap: 4 },
  categoryButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  categoryButtonPressed: { opacity: 0.78 },
  categoryText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
