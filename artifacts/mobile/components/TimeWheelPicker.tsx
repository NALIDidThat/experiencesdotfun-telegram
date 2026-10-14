import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';
import { GlassWheelColumn } from './DateSliderPicker';

type TimeParts = { hour: number; minute: number };

const pad = (value: number) => String(value).padStart(2, '0');

function parseTime(value?: string): TimeParts | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? '');
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatTime({ hour, minute }: TimeParts) {
  return `${pad(hour)}:${pad(minute)}`;
}

export function TimeWheelPicker({
  label,
  value,
  placeholder,
  testID,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  testID: string;
  onChange: (time: string) => void;
}) {
  const colors = useColors();
  const parts = parseTime(value) ?? parseTime(placeholder) ?? { hour: 10, minute: 0 };
  const selectHour = (hour: number) => onChange(formatTime({ ...parts, hour }));
  const selectMinute = (minute: number) => onChange(formatTime({ ...parts, minute }));

  return (
    <View
      accessibilityLabel={`${label}, ${formatTime(parts)}`}
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: colors.radius,
        borderWidth: 1,
        gap: 10,
        padding: 14,
      }}
      testID={testID}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Feather name="clock" size={15} color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>
            24-HOUR TIME
          </Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontSize: 17, fontWeight: '700' }}>
          {formatTime(parts)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <GlassWheelColumn
          label="Hour"
          min={0}
          max={23}
          value={parts.hour}
          values={Array.from({ length: 24 }, (_, hour) => pad(hour))}
          testID={`${testID}-hour`}
          onChange={selectHour}
          onItemPress={selectHour}
        />
        <GlassWheelColumn
          label="Minute"
          min={0}
          max={59}
          value={parts.minute}
          values={Array.from({ length: 60 }, (_, minute) => pad(minute))}
          testID={`${testID}-minute`}
          onChange={selectMinute}
          onItemPress={selectMinute}
        />
      </View>
    </View>
  );
}
