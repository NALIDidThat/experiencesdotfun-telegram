import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  APIProvider,
  AltitudeMode,
  GestureHandling,
  Map3D,
  MapMode,
  Marker3D,
  Pin,
  useMapsLibrary,
  type Map3DCameraChangedEvent,
  type Map3DRef,
  type Map3DSteadyChangeEvent,
} from '@vis.gl/react-google-maps';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import { useColors } from '@/hooks/useColors';
import type { ExploreMapCategory, ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

type Point = { lat: number; lng: number };
type NearbyPlace = { id: string; name: string; position: Point };
type SearchPlace = { id?: string; displayName?: string | null; location?: { lat: () => number; lng: () => number } | null };
const WORLD_RANGE = 25_000_000;
const CATEGORIES: Array<{ id: ExploreMapCategory; label: string; types?: string[] }> = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food', types: ['restaurant', 'cafe'] },
  { id: 'parks', label: 'Parks', types: ['park'] },
  { id: 'community', label: 'Community', types: ['community_center', 'library'] },
  { id: 'culture', label: 'Culture', types: ['museum', 'art_gallery'] },
  { id: 'shopping', label: 'Shopping', types: ['shopping_mall', 'clothing_store'] },
  { id: 'transit', label: 'Transit', types: ['transit_station', 'bus_station'] },
  { id: 'essentials', label: 'Essentials', types: ['pharmacy', 'grocery_store'] },
];

const point = (value?: { latitude: number; longitude: number } | null): Point | null => (
  value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    ? { lat: value.latitude, lng: value.longitude }
    : null
);

function NearbySearch({
  center, category, token, onStatus, onResults,
}: {
  center: Point;
  category: ExploreMapCategory;
  token: number;
  onStatus: (status: 'loading' | 'ready' | 'empty' | 'error') => void;
  onResults: (places: NearbyPlace[]) => void;
}) {
  const library = useMapsLibrary('places');
  useEffect(() => {
    if (!library || !token) return;
    let cancelled = false;
    const activeCategory = CATEGORIES.find((item) => item.id === category);
    onStatus('loading');
    void library.Place.searchNearby({
      fields: ['id', 'displayName', 'location'],
      locationRestriction: { center, radius: 3200 },
      ...(activeCategory?.types ? { includedTypes: activeCategory.types } : {}),
      maxResultCount: 20,
    }).then((result: { places: SearchPlace[] }) => {
      if (cancelled) return;
      const places = result.places.flatMap((place: SearchPlace) => (
        place.location ? [{
          id: place.id ?? `${place.displayName ?? 'place'}-${place.location.lat()}-${place.location.lng()}`,
          name: place.displayName ?? 'Nearby place',
          position: { lat: place.location.lat(), lng: place.location.lng() },
        }] : []
      ));
      onResults(places);
      onStatus(places.length ? 'ready' : 'empty');
    }).catch(() => {
      if (!cancelled) onStatus('error');
    });
    return () => { cancelled = true; };
  }, [library, center.lat, center.lng, category, token, onResults, onStatus]);
  return null;
}

const ExploreMapGoogle3D = React.forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMapGoogle3D(props, ref) {
  const colors = useColors();
  const fallbackRef = useRef<ExploreMapHandle>(null);
  const mapRef = useRef<Map3DRef | null>(null);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [category, setCategory] = useState<ExploreMapCategory>('all');
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [searchToken, setSearchToken] = useState(0);
  const [locationMessage, setLocationMessage] = useState('');
  const initialCenter = point(props.profileCityCenter) ?? point(props.selectedCityCoordinates) ?? { lat: 20, lng: 0 };
  const initialSearchCenter = point(props.profileCityCenter) ?? point(props.selectedCityCoordinates);
  const [mapCenter, setMapCenter] = useState<Point>(initialCenter);
  const initialSearchStarted = useRef(false);

  useEffect(() => {
    setMapCenter(initialCenter);
  }, [initialCenter.lat, initialCenter.lng]);

  const focusOnCity = useCallback((latitude: number, longitude: number) => {
    const map = mapRef.current?.map3d;
    if (map) {
      map.center = { lat: latitude, lng: longitude, altitude: 0 };
      map.range = 15_000;
      map.tilt = 55;
    }
  }, []);
  const resetView = useCallback(() => {
    const map = mapRef.current?.map3d;
    if (map) {
      map.center = { ...initialCenter, altitude: 0 };
      map.range = WORLD_RANGE;
      map.tilt = 0;
    }
    setMapCenter(initialCenter);
    setNearby([]);
    setNearbyStatus('idle');
    props.onResetCity();
  }, [initialCenter.lat, initialCenter.lng, props.onResetCity]);

  React.useImperativeHandle(ref, () => ({
    focusOnCity,
    resetView,
  }), [focusOnCity, resetView]);

  const searchArea = useCallback(() => {
    setNearby([]);
    setNearbyStatus('loading');
    setSearchToken((value) => value + 1);
  }, []);
  const findMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.');
      return;
    }
    setLocationMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        setMapCenter(next);
        const map = mapRef.current?.map3d;
        if (map) {
          map.center = { ...next, altitude: 0 };
          map.range = 12_000;
          map.tilt = 55;
        }
        setLocationMessage('Showing your approximate current location.');
      },
      () => setLocationMessage('Could not get your location. Check your browser permission.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, []);

  if (!props.apiKey || failed) {
    return (
      <View style={styles.root} testID="explore-map-fallback">
        <ExploreGlobe
          ref={fallbackRef}
          cities={props.cities}
          friends={props.friends}
          experienceLocations={props.experienceLocations}
          mode={props.mode}
          selectedCity={props.selectedCity}
          selectedCityCoordinates={props.selectedCityCoordinates}
          status={props.status}
          verifiedActivityStatus={props.verifiedActivityStatus}
          fullScreen={props.fullScreen}
          showFriends={props.showFriends}
          onSelectCity={props.onSelectCity}
          onSelectFriend={props.onSelectFriend}
          onSelectExperience={props.onSelectExperience}
          onExploreCity={props.onExploreCity}
          onResetCity={props.onResetCity}
        />
        <View
          testID="explore-map-configuration-notice"
          style={[
            styles.notice,
            { backgroundColor: colors.card, borderColor: colors.border },
            { bottom: Math.max(12, (props.sheetOverlayHeight ?? 0) + 12) },
          ]}
        >
          <Text style={{ color: colors.foreground }}>
            {props.apiKey ? 'Google 3D Maps unavailable' : 'Google Maps key not configured'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <APIProvider apiKey={props.apiKey} libraries={['maps3d', 'marker', 'places']} onError={() => setFailed(true)}>
      <View style={styles.root} testID="explore-map">
        <Map3D
          ref={mapRef}
          mode={MapMode.SATELLITE}
          gestureHandling={GestureHandling.GREEDY}
          defaultCenter={{ ...initialCenter, altitude: 0 }}
          defaultRange={WORLD_RANGE}
          defaultTilt={0}
          defaultHeading={0}
          defaultRoll={0}
          onCameraChanged={(event: Map3DCameraChangedEvent) => setMapCenter({ lat: event.detail.center.lat, lng: event.detail.center.lng })}
          onSteadyChange={(event: Map3DSteadyChangeEvent) => {
            setMapReady(event.detail.isSteady);
            if (event.detail.isSteady && initialSearchCenter && !initialSearchStarted.current) {
              initialSearchStarted.current = true;
              setSearchToken(1);
            }
          }}
          onError={() => setFailed(true)}
          style={styles.map}
        >
          {props.cities.map((city) => {
            const friendCount = props.friends?.filter((friend) => friend.city.trim().toLowerCase() === city.city.trim().toLowerCase()).length ?? 0;
            const count = props.mode === 'impact'
              ? city.xpOffered
              : props.mode === 'activity'
                ? city.participants
                : props.mode === 'social'
                  ? friendCount
                  : city.experiences;
            const description = props.mode === 'impact'
              ? `${city.city}: ${count} XP offered`
              : props.mode === 'activity'
                ? `${city.city}: ${count} participants signed up; ${city.recentVerifiedCompletions} host-verified completions`
                : props.mode === 'social'
                  ? `${city.city}: ${count} friends by approximate profile city`
                  : `${city.city}: ${count} experiences`;
            return (
              <Marker3D
                key={`city-${city.city}`}
                position={{ lat: city.latitude, lng: city.longitude, altitude: 0 }}
                altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                title={description}
                onClick={() => {
                  props.onSelectCity(city.city);
                  focusOnCity(city.latitude, city.longitude);
                }}
              >
                <Pin background={colors.primary} borderColor={colors.card} glyphColor={colors.primaryForeground} glyph={String(count)} scale={1.4} />
              </Marker3D>
            );
          })}
          {props.fullScreen && props.mode === 'explore' ? props.experienceLocations?.map((item) => (
            <Marker3D
              key={`experience-${item.experienceId}`}
              position={{ lat: item.latitude, lng: item.longitude, altitude: 0 }}
              altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
              title={`${item.title} · approximate ${item.precision.replace('_', ' ')} location`}
              onClick={() => props.onSelectExperience?.(item.experienceId)}
            >
              <Pin background={colors.teal} borderColor={colors.card} glyphColor={colors.primaryForeground} glyph="✓" />
            </Marker3D>
          )) : null}
          {(props.showFriends || props.mode === 'social') ? props.friends?.map((friend) => (
            <Marker3D
              key={`friend-${friend.id}`}
              position={{ lat: friend.latitude, lng: friend.longitude, altitude: 0 }}
              altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
              title={`${friend.name} · approximate profile city: ${friend.city}`}
              onClick={() => props.onSelectFriend?.(friend.id)}
            >
              <Pin background={colors.violet} borderColor={colors.card} glyphColor={colors.primaryForeground} glyph={friend.name.trim().charAt(0).toUpperCase()} />
            </Marker3D>
          )) : null}
          {nearby.map((place) => (
            <Marker3D
              key={place.id}
              position={{ ...place.position, altitude: 0 }}
              altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
              title={place.name}
            >
              <Pin background={colors.card} borderColor={colors.teal} glyphColor={colors.teal} glyph="•" />
            </Marker3D>
          ))}
        </Map3D>
        {initialSearchCenter ? (
          <NearbySearch
            center={mapCenter}
            category={category}
            token={searchToken}
            onStatus={setNearbyStatus}
            onResults={setNearby}
          />
        ) : null}
        <View pointerEvents="box-none" style={[styles.controls, { paddingBottom: Math.max(16, (props.sheetOverlayHeight ?? 0) + 12) }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === category }}
                testID={`explore-nearby-category-${item.id}`}
                onPress={() => { setCategory(item.id); searchArea(); }}
                style={[styles.category, { backgroundColor: category === item.id ? colors.primary : colors.card }]}
              >
                <Text style={{ color: category === item.id ? colors.primaryForeground : colors.foreground }}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" testID="explore-map-my-location" onPress={findMyLocation} style={[styles.action, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.foreground }}>My location</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="explore-map-search-area" onPress={searchArea} style={[styles.action, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.foreground }}>{nearbyStatus === 'loading' ? 'Searching…' : 'Search nearby'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="explore-map-reset" onPress={resetView} style={[styles.action, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.foreground }}>Reset Earth</Text>
            </Pressable>
          </View>
          {locationMessage ? <View style={[styles.status, { backgroundColor: colors.card }]}><Text style={{ color: colors.foreground }}>{locationMessage}</Text></View> : null}
          {nearbyStatus === 'ready' || nearbyStatus === 'empty' || nearbyStatus === 'error' ? (
            <View style={[styles.status, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.foreground }}>
                {nearbyStatus === 'ready' ? `${nearby.length} nearby places` : nearbyStatus === 'empty' ? 'No nearby places found' : 'Nearby places could not load'}
              </Text>
            </View>
          ) : null}
          {!mapReady ? <View style={[styles.status, { backgroundColor: colors.card }]}><Text style={{ color: colors.foreground }}>Loading Google 3D Earth…</Text></View> : null}
        </View>
      </View>
    </APIProvider>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#071f3d' },
  map: { width: '100%', height: '100%' },
  controls: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', paddingBottom: 16, gap: 8 },
  categories: { flexDirection: 'row', gap: 6, paddingHorizontal: 10 },
  category: { borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, gap: 8 },
  action: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  status: { alignSelf: 'flex-start', marginLeft: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  notice: { position: 'absolute', left: 12, bottom: 12, borderWidth: 1, padding: 12, borderRadius: 10 },
});

export default ExploreMapGoogle3D;
