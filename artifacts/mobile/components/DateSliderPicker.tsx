import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PanResponderGestureState,
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

function DatePartSlider({
  label,
  value,
  min,
  max,
  valueText,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const dragStartX = useRef(0);
  const changeRef = useRef(onChange);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const valueAtX = (x: number) => {
    if (trackWidth <= 0 || max <= min) return min;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    return min + Math.round(ratio * (max - min));
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderGrant: (event, gesture) => {
      const localX = event.nativeEvent.locationX ?? 0;
      dragStartX.current = localX - gesture.dx;
      changeRef.current(valueAtX(localX));
    },
    onPanResponderMove: (_event, gesture: PanResponderGestureState) => {
      changeRef.current(valueAtX(dragStartX.current + gesture.dx));
    },
  }), [trackWidth, min, max]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };
  const fraction = max === min ? 0 : (value - min) / (max - min);
  const percentage = `${Math.max(0, Math.min(1, fraction)) * 100}%` as `${number}%`;

  return (
    <View style={{ gap: 5 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 }}>
          {label.toUpperCase()}
        </Text>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>
          {valueText}
        </Text>
      </View>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          accessibilityRole="button"
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={{ alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: 'center', opacity: value <= min ? 0.4 : 1, width: 44 }}
        >
          <Feather name="minus" size={15} color={colors.foreground} />
        </Pressable>
        <View
          {...responder.panHandlers}
          accessibilityActions={[{ name: 'increment', label: `Increase ${label.toLowerCase()}` }, { name: 'decrement', label: `Decrease ${label.toLowerCase()}` }]}
          accessibilityLabel={label}
          accessibilityRole="adjustable"
          accessibilityValue={{ min, max, now: value, text: valueText }}
          onAccessibilityAction={(event) => {
            const next = event.nativeEvent.actionName === 'increment' ? value + 1 : value - 1;
            onChange(Math.max(min, Math.min(max, next)));
          }}
          onLayout={onTrackLayout}
          style={{ height: 40, justifyContent: 'center', flex: 1 }}
          testID={`date-slider-${label.toLowerCase()}`}
        >
          <View style={{ backgroundColor: colors.border, borderRadius: 3, height: 6, overflow: 'visible' }}>
            <View style={{ backgroundColor: colors.primary, borderRadius: 3, height: 6, width: percentage }} />
              <View style={{ alignItems: 'center', backgroundColor: colors.card, borderColor: colors.primary, borderRadius: 12, borderWidth: 3, height: 20, justifyContent: 'center', left: percentage, marginLeft: -10, marginTop: -7, position: 'absolute', width: 20 }}>
              <View style={{ backgroundColor: colors.primary, borderRadius: 3, height: 6, width: 6 }} />
            </View>
          </View>
        </View>
        <Pressable
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          accessibilityRole="button"
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={{ alignItems: 'center', borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: 'center', opacity: value >= max ? 0.4 : 1, width: 44 }}
        >
          <Feather name="plus" size={15} color={colors.foreground} />
        </Pressable>
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
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius - 8, borderWidth: 1, gap: 14, padding: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 }}>
          DAY / MONTH / YEAR
        </Text>
        <Feather name="calendar" size={16} color={colors.primary} />
      </View>
      <DatePartSlider
        label="Day"
        min={1}
        max={maxDay}
        value={parts.day}
        valueText={pad(parts.day)}
        onChange={(next) => setPart('day', next)}
      />
      <DatePartSlider
        label="Month"
        min={1}
        max={12}
        value={parts.month}
        valueText={`${pad(parts.month)} · ${monthName}`}
        onChange={(next) => setPart('month', next)}
      />
      <DatePartSlider
        label="Year"
        min={minYear}
        max={maxYear}
        value={parts.year}
        valueText={String(parts.year)}
        onChange={(next) => setPart('year', next)}
      />
      <View style={{ alignItems: 'center', backgroundColor: colors.muted, borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 11 }}>
        <Feather name={dateIsSelected ? 'check-circle' : 'info'} size={16} color={dateIsSelected ? colors.primary : colors.mutedForeground} />
        <Text style={{ color: dateIsSelected ? colors.foreground : colors.mutedForeground, fontSize: 13, fontWeight: '600' }}>
          {dateIsSelected ? `Selected date: ${selectedDate}` : 'Move a slider or choose this date'}
        </Text>
      </View>
      {!dateIsSelected ? (
        <Pressable
          accessibilityRole="button"
          onPress={selectCurrentDate}
          style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 }}
          testID="create-date-use-selected"
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>Use {selectedDate}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}