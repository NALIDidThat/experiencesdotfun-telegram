import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useColors } from '../hooks/useColors';

type DateParts = { day: number; month: number; year: number };
type DatePart = keyof DateParts;

const pad = (value: number) => String(value).padStart(2, '0');

function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day) };
  const parsed = new Date(parts.year, parts.month - 1, parts.day);
  return parsed.getFullYear() === parts.year
    && parsed.getMonth() === parts.month - 1
    && parsed.getDate() === parts.day
    ? parts
    : null;
}

function todayParts(): DateParts {
  const today = new Date();
  return { day: today.getDate(), month: today.getMonth() + 1, year: today.getFullYear() };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function toIsoDate({ day, month, year }: DateParts) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function formatExperienceDateUk(value: string) {
  const parts = parseIsoDate(value);
  return parts ? `${pad(parts.day)}/${pad(parts.month)}/${parts.year}` : value;
}

const WHEEL_ROW_HEIGHT = 40;
const WHEEL_HEIGHT = 164;
const WHEEL_VERTICAL_PADDING = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

export function GlassWheelColumn({
  label,
  value,
  min,
  max,
  values,
  testID,
  onItemPress,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  values?: string[];
  testID?: string;
  onItemPress?: (value: number) => void;
  onChange: (value: number) => void;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef((value - min) * WHEEL_ROW_HEIGHT);
  const lastCommittedValue = useRef(value);
  const lastMin = useRef(min);
  const hasInitialized = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  useEffect(() => {
    if (
      hasInitialized.current
      && lastCommittedValue.current === value
      && lastMin.current === min
    ) return;
    hasInitialized.current = true;
    lastCommittedValue.current = value;
    lastMin.current = min;
    scrollOffset.current = (value - min) * WHEEL_ROW_HEIGHT;
    scrollRef.current?.scrollTo({ y: scrollOffset.current, animated: false });
  }, [min, value]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const settleAt = (offset: number) => {
    const nextValue = Math.max(min, Math.min(max, min + Math.round(offset / WHEEL_ROW_HEIGHT)));
    const nextOffset = (nextValue - min) * WHEEL_ROW_HEIGHT;
    scrollOffset.current = nextOffset;
    if (nextValue !== lastCommittedValue.current) {
      lastCommittedValue.current = nextValue;
      onChange(nextValue);
      void Haptics.selectionAsync().catch(() => undefined);
    }
    scrollRef.current?.scrollTo({ y: nextOffset, animated: Math.abs(nextOffset - offset) > 1 });
  };

  const scheduleSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settleAt(scrollOffset.current), 120);
  };

  const scrollToValue = (nextValue: number) => {
    scrollRef.current?.scrollTo({
      y: (Math.max(min, Math.min(max, nextValue)) - min) * WHEEL_ROW_HEIGHT,
      animated: true,
    });
  };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5, textAlign: 'center' }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ height: WHEEL_HEIGHT, overflow: 'hidden', position: 'relative' }}>
        <ScrollView
          accessibilityActions={[
            { name: 'increment', label: `Increase ${label.toLowerCase()}` },
            { name: 'decrement', label: `Decrease ${label.toLowerCase()}` },
          ]}
          accessibilityLabel={`${label}, ${values?.[value - min] ?? value}`}
          accessibilityRole="adjustable"
          accessibilityValue={{ min, max, now: value, text: values?.[value - min] ?? String(value) }}
          contentContainerStyle={{ paddingVertical: WHEEL_VERTICAL_PADDING }}
          decelerationRate="fast"
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            scrollToValue(value + delta);
          }}
          onMomentumScrollBegin={() => {
            if (settleTimer.current) clearTimeout(settleTimer.current);
          }}
          onMomentumScrollEnd={(event) => {
            if (settleTimer.current) clearTimeout(settleTimer.current);
            settleAt(event.nativeEvent.contentOffset.y);
          }}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
            const nextValue = Math.max(
              min,
              Math.min(max, min + Math.round(scrollOffset.current / WHEEL_ROW_HEIGHT)),
            );
            if (nextValue !== lastCommittedValue.current) {
              lastCommittedValue.current = nextValue;
              onChange(nextValue);
              void Haptics.selectionAsync().catch(() => undefined);
            }
          }}
          onScrollEndDrag={scheduleSettle}
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={WHEEL_ROW_HEIGHT}
          testID={testID ?? `date-wheel-${label.toLowerCase()}`}
        >
          {Array.from({ length: max - min + 1 }, (_, index) => {
            const itemValue = min + index;
            const selected = itemValue === value;
            return (
              <Pressable
                key={itemValue}
                accessibilityRole="button"
                onPress={() => {
                  onItemPress?.(itemValue);
                  scrollToValue(itemValue);
                }}
                testID={testID ? `${testID}-value-${itemValue}` : undefined}
                style={{ alignItems: 'center', height: WHEEL_ROW_HEIGHT, justifyContent: 'center' }}
              >
                <Text
                  style={{
                    color: selected ? colors.foreground : colors.mutedForeground,
                    fontSize: selected ? 20 : 16,
                    fontWeight: selected ? '700' : '500',
                    opacity: selected ? 1 : 0.62,
                    textAlign: 'center',
                  }}
                >
                  {values?.[index] ?? itemValue}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View
          pointerEvents="none"
          style={{
            borderColor: colors.border,
            borderRadius: 13,
            borderWidth: hasGlass ? 0 : 1,
            height: WHEEL_ROW_HEIGHT + 4,
            left: 3,
            position: 'absolute',
            right: 3,
            top: WHEEL_VERTICAL_PADDING - 2,
          }}
        >
          {hasGlass ? (
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              tintColor={`${colors.primary}18`}
              style={{ borderRadius: 13, flex: 1 }}
            />
          ) : (
            <View
              style={{
                backgroundColor: `${colors.card}B8`,
                borderColor: colors.border,
                borderRadius: 13,
                borderWidth: 1,
                flex: 1,
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

export function DateSliderPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (isoDate: string) => void;
}) {
  const colors = useColors();
  const [parts, setParts] = useState<DateParts>(() => parseIsoDate(value) ?? todayParts());

  useEffect(() => {
    setParts(parseIsoDate(value) ?? todayParts());
  }, [value]);

  const setPart = (part: DatePart, nextValue: number) => {
    const next = { ...parts, [part]: nextValue };
    next.day = Math.min(next.day, daysInMonth(next.year, next.month));
    setParts(next);
    onChange(toIsoDate(next));
  };

  const selectCurrentDate = () => onChange(toIsoDate(parts));
  const maxDay = daysInMonth(parts.year, parts.month);
  const dateIsSelected = Boolean(parseIsoDate(value));
  const currentYear = new Date().getFullYear();
  const minYear = Math.min(currentYear - 10, parts.year);
  const maxYear = Math.max(currentYear + 10, parts.year);
  const monthName = new Date(parts.year, parts.month - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long' });
  const selectedDate = `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, borderWidth: 1, gap: 13, padding: 14 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        <View style={{ alignItems: 'center', backgroundColor: colors.primary + '12', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 }}>
          <Feather name="calendar" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>Choose a date</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Set the day, month and year</Text>
        </View>
      </View>
      <View
        accessibilityLabel={`Date preview: ${parts.day} ${monthName} ${parts.year}`}
        accessibilityLiveRegion="polite"
        style={{ backgroundColor: colors.muted, borderRadius: 13, gap: 4, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Text style={{ color: colors.mutedForeground, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>EVENT DATE</Text>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '700' }}>{parts.day} {monthName} {parts.year}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <GlassWheelColumn
          label="Day"
          min={1}
          max={maxDay}
          value={parts.day}
          onChange={(next) => setPart('day', next)}
        />
        <GlassWheelColumn
          label="Month"
          min={1}
          max={12}
          value={parts.month}
          values={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']}
          onChange={(next) => setPart('month', next)}
        />
        <GlassWheelColumn
          label="Year"
          min={minYear}
          max={maxYear}
          value={parts.year}
          onChange={(next) => setPart('year', next)}
        />
      </View>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 2 }}>
        <Feather name={dateIsSelected ? 'check-circle' : 'move'} size={14} color={dateIsSelected ? colors.primary : colors.mutedForeground} />
        <Text style={{ color: dateIsSelected ? colors.foreground : colors.mutedForeground, flex: 1, fontSize: 11, fontWeight: '600' }}>
          {dateIsSelected ? `Date selected · ${selectedDate}` : 'Drag a slider or use + and − to adjust'}
        </Text>
      </View>
      {!dateIsSelected ? (
        <Pressable
          accessibilityLabel={`Use ${selectedDate} as the experience date`}
          accessibilityRole="button"
          onPress={selectCurrentDate}
          style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 }}
          testID="create-date-use-selected"
        >
          <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: '700' }}>Use {selectedDate}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}