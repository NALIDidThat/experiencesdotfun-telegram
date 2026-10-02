import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

const MIN_XP = 0;
const MAX_XP = 1000;

export function ExperienceXpSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const dragStartX = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const selectedValue = Math.max(MIN_XP, Math.min(MAX_XP, Math.round(value)));
  const valueAtX = (x: number) => {
    if (trackWidth <= 0) return MIN_XP;
    const position = Math.max(0, Math.min(trackWidth, x));
    return Math.round((position / trackWidth) * MAX_XP);
  };
  const percentage = `${(selectedValue / MAX_XP) * 100}%` as `${number}%`;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event, gesture) => {
          const localX = event.nativeEvent.locationX ?? 0;
          dragStartX.current = Math.max(0, Math.min(trackWidth, localX - gesture.dx));
          onChangeRef.current(valueAtX(localX));
        },
        onPanResponderMove: (_event, gesture) => {
          onChangeRef.current(valueAtX(dragStartX.current + gesture.dx));
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [trackWidth],
  );

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container} testID="create-xp-reward-control">
      <View style={styles.valueRow}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>XP REWARD</Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.value, { color: colors.primary }]}
          testID="create-xp-reward-current-value"
        >
          {selectedValue} <Text style={styles.valueUnit}>XP</Text>
        </Text>
      </View>

      <View
        {...panResponder.panHandlers}
        accessibilityActions={[
          { name: 'increment', label: 'Increase XP reward' },
          { name: 'decrement', label: 'Decrease XP reward' },
        ]}
        accessibilityLabel="XP reward"
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: MIN_XP,
          max: MAX_XP,
          now: selectedValue,
          text: `${selectedValue} XP`,
        }}
        onAccessibilityAction={(event) => {
          const change = event.nativeEvent.actionName === 'increment' ? 10 : -10;
          onChangeRef.current(Math.max(MIN_XP, Math.min(MAX_XP, selectedValue + change)));
        }}
        onLayout={onTrackLayout}
        style={styles.touchArea}
        testID="create-xp-reward-slider"
      >
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.primary, width: percentage },
            ]}
          />
          <View
            style={[
              styles.thumb,
              {
                backgroundColor: colors.card,
                borderColor: colors.primary,
                left: percentage,
              },
            ]}
          >
            <View style={[styles.thumbCore, { backgroundColor: colors.primary }]} />
          </View>
        </View>
      </View>

      <View style={styles.rangeRow}>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>0 XP</Text>
        <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>1,000 XP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  valueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.9,
  },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    letterSpacing: -0.5,
  },
  valueUnit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    letterSpacing: 0,
  },
  touchArea: {
    height: 48,
    justifyContent: 'center',
    marginHorizontal: 11,
  },
  track: {
    borderRadius: 4,
    height: 7,
    overflow: 'visible',
  },
  fill: {
    borderRadius: 4,
    height: 7,
  },
  thumb: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 3,
    height: 23,
    justifyContent: 'center',
    marginLeft: -11,
    position: 'absolute',
    top: -8,
    width: 23,
  },
  thumbCore: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -5,
  },
  rangeLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
});