import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OrganisationType } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { organisationOnboardingCopy } from "@/lib/organisation-onboarding-copy";

const pageVisuals = [
  { icon: "heart", color: "primary", label: "A mission with momentum" },
  { icon: "users", color: "teal", label: "People taking part" },
  { icon: "bar-chart-2", color: "secondary", label: "Progress you can follow" },
] as const;

type Props = {
  organisationType: OrganisationType;
  onBackToOrganisationType: () => void;
  onContinueToSignIn: () => void;
};

export function OrganisationOnboardingWalkthrough({
  organisationType,
  onBackToOrganisationType,
  onContinueToSignIn,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const pageRef = useRef(pageIndex);
  pageRef.current = pageIndex;

  const transition = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  const touchStartX = useRef<number | null>(null);
  const stepRef = useRef<(delta: number) => void>(() => {});
  const pages = organisationOnboardingCopy[organisationType];
  const currentPage = pages[pageIndex];
  const visual = pageVisuals[pageIndex];
  const visualColor = colors[visual.color];
  const illustrationHeight = height < 620 ? 108 : height < 720 ? 158 : 222;
  const compactSheet = height < 620;
  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : Math.max(insets.top, 12);
  const bottomInset = Platform.OS === "web" ? Math.max(insets.bottom, 34) : Math.max(insets.bottom, 20);

  const movePage = (delta: number) => {
    const nextPage = pageRef.current + delta;
    if (nextPage < 0) {
      onBackToOrganisationType();
      return;
    }
    if (nextPage >= pages.length) {
      onContinueToSignIn();
      return;
    }

    direction.current = delta;
    pageRef.current = nextPage;
    setPageIndex(nextPage);
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  stepRef.current = movePage;

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) > 48 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
        stepRef.current(gesture.dx < 0 ? 1 : -1);
      }
    },
  }), []);

  const handleTouchStart = (event: GestureResponderEvent) => {
    if (Platform.OS === "web") {
      touchStartX.current = event.nativeEvent.touches[0]?.pageX
        ?? event.nativeEvent.changedTouches[0]?.pageX
        ?? event.nativeEvent.pageX;
    }
  };
  const handleTouchMove = (event: GestureResponderEvent) => {
    if (Platform.OS !== "web" || touchStartX.current === null) return;
    const touchX = event.nativeEvent.changedTouches[0]?.pageX
      ?? event.nativeEvent.touches[0]?.pageX
      ?? event.nativeEvent.pageX;
    if (Math.abs(touchX - touchStartX.current) > 12) event.preventDefault();
  };
  const handleTouchEnd = (event: GestureResponderEvent) => {
    if (Platform.OS !== "web" || touchStartX.current === null) return;
    const touchEndX = event.nativeEvent.changedTouches[0]?.pageX
      ?? event.nativeEvent.touches[0]?.pageX
      ?? event.nativeEvent.pageX;
    const deltaX = touchEndX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) > 48) stepRef.current(deltaX < 0 ? 1 : -1);
  };

  const animatedPageStyle = {
    opacity: transition,
    transform: [
      {
        translateX: transition.interpolate({
          inputRange: [0, 1],
          outputRange: [direction.current * 20, 0],
        }),
      },
    ],
  };
  const webSwipeStyle = Platform.OS === "web"
    ? ({ touchAction: "pan-y" } as unknown as ViewStyle)
    : null;

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }]}
      testID="organisation-walkthrough"
    >
      <View
        style={[styles.mainContent, { paddingTop: topInset }]}
        testID="organisation-walkthrough-main"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pageIndex === 0 ? "Back to organisation type selection" : "Return to previous introduction page"}
            testID="organisation-walkthrough-back"
            onPress={() => movePage(-1)}
            hitSlop={10}
            style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </Pressable>
          <Text accessibilityRole="header" style={[styles.brand, { color: colors.foreground }]}>
            experiences.fun
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View
          accessibilityLabel={`Introduction page ${pageIndex + 1} of ${pages.length}`}
          style={styles.progress}
          testID="organisation-walkthrough-progress"
        >
          {pages.map((_, index) => (
            <View
              key={index}
              testID={`organisation-walkthrough-dot-${index + 1}`}
              style={[
                styles.progressDot,
                {
                  width: index === pageIndex ? 25 : 7,
                  backgroundColor: index === pageIndex ? colors.primary : colors.border,
                },
              ]}
            />
          ))}
        </View>

        <Animated.View
          {...(Platform.OS === "web" ? {} : panResponder.panHandlers)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { touchStartX.current = null; }}
          style={[styles.page, animatedPageStyle, webSwipeStyle]}
          testID={`organisation-walkthrough-page-${pageIndex + 1}`}
        >
          <View
            accessibilityLabel={`Illustration: ${visual.label}`}
            style={[
              styles.illustration,
              { backgroundColor: colors.primary + "10", height: illustrationHeight },
            ]}
            testID="organisation-walkthrough-illustration"
          >
            <View style={[styles.illustrationOrb, styles.illustrationOrbLeft, { backgroundColor: colors.teal + "22" }]} />
            <View style={[styles.illustrationOrb, styles.illustrationOrbRight, { backgroundColor: colors.secondary + "18" }]} />
            <View style={[styles.illustrationRing, { borderColor: visualColor + "28" }]} />
            <View style={[styles.illustrationIconCard, { backgroundColor: colors.card, borderColor: visualColor + "26" }]}>
              <Feather name={visual.icon} size={48} color={visualColor} />
            </View>
            <View style={[styles.illustrationCaption, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.illustrationCaptionIcon, { backgroundColor: visualColor + "16" }]}>
                <Feather name="check" size={13} color={visualColor} />
              </View>
              <Text style={[styles.illustrationCaptionText, { color: colors.foreground }]}>{visual.label}</Text>
            </View>
          </View>
        </Animated.View>
      </View>

      <View
        style={[
          styles.copySheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.foreground,
            paddingBottom: bottomInset,
            paddingTop: compactSheet ? 20 : 26,
          },
        ]}
        testID="organisation-walkthrough-sheet"
      >
        <View style={styles.sheetInner}>
          <View style={styles.copyContent}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              {pageIndex === 0 ? "YOUR MISSION" : pageIndex === 1 ? "TAKE ACTION" : "SEE THE PROGRESS"}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.foreground }]}
              testID="organisation-walkthrough-title"
            >
              {currentPage.headline}
            </Text>
            <Text
              style={[styles.description, { color: colors.mutedForeground }]}
              testID="organisation-walkthrough-description"
            >
              {currentPage.description}
            </Text>
          </View>

          <View
            style={[styles.footer, { marginTop: compactSheet ? 16 : 24 }]}
            testID="organisation-walkthrough-footer"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip introduction and continue to sign in"
              onPress={onContinueToSignIn}
              testID="organisation-walkthrough-skip"
              hitSlop={12}
              style={styles.skipButton}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
            </Pressable>
            <Text style={[styles.pageCount, { color: colors.mutedForeground }]}>
              {String(pageIndex + 1).padStart(2, "0")} / {String(pages.length).padStart(2, "0")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pageIndex === pages.length - 1 ? "Continue to sign in" : "Go to the next introduction page"}
              onPress={() => movePage(1)}
              testID="organisation-walkthrough-next"
              style={[styles.nextButton, { backgroundColor: colors.primary }]}
            >
              <Feather name="arrow-right" size={20} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mainContent: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    justifyContent: "flex-start",
    paddingBottom: 12,
    gap: 12,
  },
  copySheet: {
    width: "100%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    paddingHorizontal: 22,
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  sheetInner: { width: "100%", maxWidth: 520, alignSelf: "center" },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  headerSpacer: { width: 42 },
  progress: { minHeight: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  progressDot: { height: 7, borderRadius: 5 },
  page: { flex: 1, justifyContent: "center", alignItems: "stretch", paddingHorizontal: 22 },
  illustration: {
    width: "100%",
    borderRadius: 30,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  illustrationOrb: { position: "absolute", borderRadius: 999 },
  illustrationOrbLeft: { width: 138, height: 138, left: -38, top: 34 },
  illustrationOrbRight: { width: 112, height: 112, right: -19, top: -22 },
  illustrationRing: {
    position: "absolute",
    width: 174,
    height: 174,
    borderWidth: 1,
    borderRadius: 90,
  },
  illustrationIconCard: {
    width: 112,
    height: 112,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationCaption: {
    position: "absolute",
    bottom: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  illustrationCaptionIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  illustrationCaptionText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  copyContent: {
    width: "100%",
  },
  eyebrow: { fontSize: 10, lineHeight: 14, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 9 },
  title: { fontSize: 26, lineHeight: 31, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular", marginTop: 9 },
  footer: { minHeight: 52, flexDirection: "row", alignItems: "center" },
  skipButton: { minWidth: 60, minHeight: 44, alignItems: "flex-start", justifyContent: "center" },
  skipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pageCount: { flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center", letterSpacing: 0.6 },
  nextButton: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
});
