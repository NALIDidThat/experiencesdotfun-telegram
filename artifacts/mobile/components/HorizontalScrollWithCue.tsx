import React, { useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  accessibilityLabel: string;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID: string;
};

export function HorizontalScrollWithCue({
  accessibilityLabel,
  children,
  contentContainerStyle,
  style,
  testID,
}: Props) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxOffset = Math.max(0, contentWidth - viewportWidth);
  const hasOverflow = maxOffset > 1;
  const isAtEnd = hasOverflow && scrollOffset >= maxOffset - 4;

  return (
    <View style={[styles.row, style]}>
      <ScrollView
        ref={scrollRef}
        testID={`${testID}-scroll`}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Swipe or use the adjacent button to reveal more options."
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        onScroll={(event) => setScrollOffset(Math.max(0, event.nativeEvent.contentOffset.x))}
      >
        {children}
      </ScrollView>
      {hasOverflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isAtEnd ? `Show the first ${accessibilityLabel}` : `Show the remaining ${accessibilityLabel}`}
          accessibilityHint={isAtEnd ? 'Moves the row back to its first options.' : 'Moves the row to its remaining options.'}
          testID={`${testID}-cue`}
          hitSlop={4}
          onPress={() => scrollRef.current?.scrollTo({ x: isAtEnd ? 0 : maxOffset, animated: true })}
          style={({ pressed }) => [
            styles.cue,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.cueText, { color: colors.foreground }]}>
            {isAtEnd ? 'Back' : 'More'}
          </Text>
          <Feather name={isAtEnd ? 'chevron-left' : 'chevron-right'} size={14} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    width: '100%',
  },
  scroll: {
    flex: 1,
    minWidth: 0,
  },
  cue: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 58,
    paddingHorizontal: 7,
  },
  cueText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
});
