import { Pressable, Platform, StyleSheet, View } from "react-native";
import { PoppinsText as Text } from "@/components/Typography";
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
  variant = "glass",
}: {
  category: FeedPostCategory;
  onCategoryChange: (category: FeedPostCategory) => void;
  testIDPrefix?: string;
  variant?: "glass" | "minimal";
}) {
  const colors = useColors();
  const minimal = variant === "minimal";
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
          backgroundColor: minimal ? colors.muted : `${colors.primary}08`,
          borderColor: minimal ? colors.border : `${colors.primary}48`,
        },
      ]}
    >
      {!minimal ? (
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
      ) : null}
      <View
        accessibilityRole="tablist"
        style={[styles.categoryControl, minimal && styles.minimalCategoryControl]}
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
                minimal && styles.minimalCategoryButton,
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
  minimalCategoryControl: { gap: 3 },
  categoryButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  minimalCategoryButton: { minHeight: 42, borderRadius: 11 },
  categoryButtonPressed: { opacity: 0.78 },
  categoryText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
