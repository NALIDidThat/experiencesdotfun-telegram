import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import {
  normalizeLocationQuery,
  resolveLocationResults,
  type LocationSearchResult,
  type ResolvedLocation,
} from '@/lib/location-resolution';

export type { ResolvedLocation } from '@/lib/location-resolution';

export function ExperienceLocationPicker({
  value,
  selectedLocation,
  onChange,
  onSelectLocation,
}: {
  value: string;
  selectedLocation: ResolvedLocation | null;
  onChange: (value: string) => void;
  onSelectLocation: (location: ResolvedLocation | null) => void;
}) {
  const colors = useColors();
  const [suggestions, setSuggestions] = useState<ResolvedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || selectedLocation?.display === value) {
      setSuggestions([]);
      setLoading(false);
      setLookupError(false);
      return;
    }
    const geocodeQuery = normalizeLocationQuery(query);
    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLookupError(false);
      try {
        const params = new URLSearchParams({ name: geocodeQuery, count: '8', language: 'en', format: 'json' });
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
        if (!response.ok) throw new Error('Location search failed');
        const data = await response.json() as { results?: LocationSearchResult[] };
        if (!current) return;
        setSuggestions(resolveLocationResults(data.results ?? [], query));
      } catch {
        if (current) {
          setSuggestions([]);
          setLookupError(true);
        }
      } finally {
        if (current) setLoading(false);
      }
    }, 320);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [value, selectedLocation]);

  const chooseLocation = (location: ResolvedLocation) => {
    onChange(location.display);
    onSelectLocation(location);
    setSuggestions([]);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: selectedLocation ? colors.primary + '70' : colors.input, borderRadius: colors.radius - 8, backgroundColor: selectedLocation ? colors.primary + '0A' : colors.card, paddingHorizontal: 13 }}>
        <Feather name="map-pin" size={17} color={colors.primary} />
        <TextInput
          accessibilityLabel="City or country"
          accessibilityHint="Type a place, then choose a matching result to show it on the globe."
          testID="create-field-city"
          value={value}
          onChangeText={(text) => {
            onChange(text);
            onSelectLocation(null);
          }}
          placeholder="Search for a city or country"
          placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, minWidth: 0, paddingVertical: 12, color: colors.foreground, fontSize: 15 }}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear location"
            onPress={() => { onChange(''); onSelectLocation(null); }}
            style={{ width: 34, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x-circle" size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {loading ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 12 }}>Finding places…</Text> : null}
      {lookupError ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, fontSize: 12 }}>Place search is unavailable. You can still enter a city and continue.</Text> : null}
      {suggestions.length > 0 ? (
        <View style={{ overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card }}>
          {suggestions.map((place, index) => (
            <Pressable
              key={`${place.id}-${place.latitude}-${place.longitude}`}
              accessibilityRole="button"
              accessibilityLabel={`Select ${place.display}`}
              testID={`create-city-suggestion-${index}`}
              onPress={() => chooseLocation(place)}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: index === suggestions.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
            >
              <Feather name={place.feature_code.startsWith('PCL') ? 'globe' : 'map-pin'} size={15} color={colors.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{place.name}</Text>
                <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11 }}>{[place.admin1, place.country].filter(Boolean).join(', ')}</Text>
              </View>
              <Feather name="arrow-up-left" size={14} color={colors.mutedForeground} />
            </Pressable>
          ))}
          <Text style={{ color: colors.mutedForeground, fontSize: 9, paddingHorizontal: 12, paddingVertical: 6, textAlign: 'right' }}>Place search by Open-Meteo</Text>
        </View>
      ) : null}
      {value.trim().length >= 2 && !loading && !lookupError && suggestions.length === 0 && !selectedLocation ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: 12 }}>
          No matching places. You can still continue with the name you entered.
        </Text>
      ) : null}

      {selectedLocation ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="check-circle" size={14} color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
            {selectedLocation.display}
          </Text>
        </View>
      ) : null}

      <ExploreGlobe
        cities={[]}
        mode="explore"
        selectedCity={selectedLocation?.display ?? null}
        selectedCityCoordinates={selectedLocation ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude } : undefined}
        status="ready"
        locationPicker
        onSelectCity={() => {}}
        onExploreCity={() => {}}
        onResetCity={() => onSelectLocation(null)}
      />
    </View>
  );
}
