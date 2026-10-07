import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { APIProvider, AdvancedMarker, Map as GoogleMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Feather } from '@expo/vector-icons';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import { useColors } from '@/hooks/useColors';
import type { ExploreMapCategory, ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

type Point = { lat: number; lng: number };
type MapController = {
  panTo: (position: Point) => void;
  setZoom: (zoom: number) => void;
  getCenter: () => { lat: () => number; lng: () => number } | null;
};
type Amenity = { id: string; title: string; address?: string; position: Point; type?: string };
const DEFAULT_CENTER: Point = { lat: 20, lng: 0 };
const MAX_NEARBY_RESULTS = 20;
const CATEGORY_TYPES: Partial<Record<ExploreMapCategory, string[]>> = {
  all: undefined,
  food: ['restaurant', 'cafe'],
  parks: ['park'],
  community: ['community_center', 'library'],
  culture: ['museum', 'art_gallery', 'performing_arts_theater'],
  shopping: ['shopping_mall', 'department_store', 'clothing_store'],
  transit: ['transit_station', 'bus_station', 'subway_station', 'train_station'],
  essentials: ['pharmacy', 'grocery_store', 'hospital', 'supermarket'],
};
const CATEGORIES: Array<{ key: ExploreMapCategory; label: string; icon: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'all', label: 'All', icon: 'map' },
  { key: 'food', label: 'Food', icon: 'coffee' },
  { key: 'parks', label: 'Parks', icon: 'sun' },
  { key: 'community', label: 'Community', icon: 'users' },
  { key: 'culture', label: 'Culture', icon: 'book-open' },
  { key: 'shopping', label: 'Shopping', icon: 'shopping-bag' },
  { key: 'transit', label: 'Transit', icon: 'navigation' },
  { key: 'essentials', label: 'Essentials', icon: 'plus-square' },
];

const toPoint = (value?: { latitude: number; longitude: number } | null): Point | null => (
  value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    ? { lat: value.latitude, lng: value.longitude }
    : null
);

function NearbyLayer({
  category,
  center,
  mapReady,
  onPendingChange,
  onStatus,
  onResults,
  searchToken,
}: {
  category: ExploreMapCategory;
  center: Point;
  mapReady: boolean;
  onPendingChange: (pending: boolean) => void;
  onStatus: (status: 'loading' | 'error' | 'empty' | 'ready') => void;
  onResults: (results: Amenity[]) => void;
  searchToken: number;
}) {
  const places = useMapsLibrary('places');
  const activeSearch = useRef(false);
  const queuedSearch = useRef(false);
  const searchRef = useRef<() => Promise<void>>(async () => {});
  searchRef.current = async () => {
    if (!places) return;
    if (activeSearch.current) {
      queuedSearch.current = true;
      return;
    }
    activeSearch.current = true;
    onPendingChange(false);
    onStatus('loading');
    onResults([]);
    try {
      const result = await places.Place.searchNearby({
        fields: ['id', 'displayName', 'location', 'formattedAddress', 'primaryType'],
        locationRestriction: { center, radius: 3200 },
        ...(CATEGORY_TYPES[category] ? { includedTypes: CATEGORY_TYPES[category] } : {}),
        maxResultCount: MAX_NEARBY_RESULTS,
      });
      const mapped = result.places.flatMap((place: {
        id?: string;
        displayName?: string;
        location?: { lat: () => number; lng: () => number } | null;
        formattedAddress?: string;
        primaryType?: string;
      }) => {
        const location = place.location;
        if (!location) return [];
        return [{
          id: place.id ?? `${place.displayName ?? 'place'}-${location.lat()}-${location.lng()}`,
          title: place.displayName ?? 'Nearby place',
          address: place.formattedAddress ?? undefined,
          type: place.primaryType ?? undefined,
          position: { lat: location.lat(), lng: location.lng() },
        }];
      }).slice(0, MAX_NEARBY_RESULTS);
      onResults(mapped);
      onStatus(mapped.length ? 'ready' : 'empty');
    } catch {
      onStatus('error');
    } finally {
      activeSearch.current = false;
      if (queuedSearch.current) {
        queuedSearch.current = false;
        void searchRef.current();
      }
    }
  };
  useEffect(() => {
    if (mapReady && places && searchToken > 0) void searchRef.current();
  }, [mapReady, places, searchToken]);
  return null;
}

const ExploreMap = React.forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMap(props, ref) {
  const colors = useColors();
  const { height: viewportHeight } = useWindowDimensions();
  const mapRef = useRef<MapController | null>(null);
  const fallbackRef = useRef<ExploreMapHandle>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapCenter, setMapCenter] = useState<Point>(() => toPoint(props.profileCityCenter) ?? toPoint(props.selectedCityCoordinates) ?? DEFAULT_CENTER);
  const friendCountsByPosition = useMemo(() => {
    const counts = new Map<string, number>();
    for (const friend of props.friends ?? []) {
      const key = `${friend.latitude.toFixed(5)},${friend.longitude.toFixed(5)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [props.friends]);
  const [category, setCategory] = useState<ExploreMapCategory>('all');
  const [places, setPlaces] = useState<Amenity[]>([]);
  const [placeStatus, setPlaceStatus] = useState<'idle' | 'loading' | 'error' | 'empty' | 'ready'>('idle');
  const [searchToken, setSearchToken] = useState(0);
  const [searchPending, setSearchPending] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading'>('idle');
  const [selectedPlace, setSelectedPlace] = useState<Amenity | null>(null);
  const [hasExplicitMapCenter, setHasExplicitMapCenter] = useState(false);
  const hasInitialSearch = useRef(false);
  const initialSearchAvailable = useRef(false);
  initialSearchAvailable.current = Boolean(toPoint(props.profileCityCenter) || toPoint(props.selectedCityCoordinates));
  const mapMoved = useRef(false);
  const focusRef = useRef<(latitude: number, longitude: number) => void>(() => {});
  const resetRef = useRef<() => void>(() => {});

  useEffect(() => {
    const profilePoint = toPoint(props.profileCityCenter);
    if (profilePoint && !hasExplicitMapCenter) {
      setMapCenter(profilePoint);
      if (mapReady) {
        mapMoved.current = false;
        mapRef.current?.panTo(profilePoint);
        mapRef.current?.setZoom(10);
      }
    }
  }, [props.profileCityCenter?.latitude, props.profileCityCenter?.longitude, hasExplicitMapCenter, mapReady]);
  useEffect(() => {
    const selectedPoint = toPoint(props.selectedCityCoordinates);
    if (selectedPoint && props.selectedCity) {
      mapMoved.current = true;
      setHasExplicitMapCenter(true);
      setSelectedPlace(null);
      setMapCenter(selectedPoint);
      mapRef.current?.panTo(selectedPoint);
      mapRef.current?.setZoom(11);
    }
  }, [props.selectedCity, props.selectedCityCoordinates?.latitude, props.selectedCityCoordinates?.longitude]);

  const focusOnCity = useCallback((latitude: number, longitude: number) => {
    const point = { lat: latitude, lng: longitude };
    mapMoved.current = true;
    setHasExplicitMapCenter(true);
    setSelectedPlace(null);
    setLocationMessage('');
    setMapCenter(point);
    mapRef.current?.panTo(point);
    mapRef.current?.setZoom(11);
  }, []);
  const resetView = useCallback(() => {
    const initial = toPoint(props.profileCityCenter) ?? DEFAULT_CENTER;
    mapMoved.current = false;
    setHasExplicitMapCenter(false);
    setSearchPending(false);
    setPlaces([]);
    setPlaceStatus('idle');
    setSelectedPlace(null);
    setLocationMessage('');
    setMapCenter(initial);
    mapRef.current?.panTo(initial);
    mapRef.current?.setZoom(initial === DEFAULT_CENTER ? 2 : 10);
  }, [props.profileCityCenter?.latitude, props.profileCityCenter?.longitude]);
  focusRef.current = (latitude, longitude) => {
    if (!props.apiKey || mapFailed) fallbackRef.current?.focusOnCity(latitude, longitude);
    else focusOnCity(latitude, longitude);
  };
  resetRef.current = () => {
    if (!props.apiKey || mapFailed) fallbackRef.current?.resetView();
    else resetView();
  };
  React.useImperativeHandle(ref, () => ({
    focusOnCity: (latitude, longitude) => focusRef.current(latitude, longitude),
    resetView: () => resetRef.current(),
  }), []);

  const handleMapIdle = useCallback((map: MapController) => {
    mapRef.current = map;
    const center = map.getCenter();
    if (center) {
      const next = { lat: center.lat(), lng: center.lng() };
      setMapCenter(next);
      if (!hasInitialSearch.current && initialSearchAvailable.current) {
        hasInitialSearch.current = true;
        setSearchToken((value) => value + 1);
      } else if (mapMoved.current) {
        setSearchPending(true);
      }
    }
    setMapReady(true);
  }, []);

  const searchArea = useCallback((explicitCenter?: Point) => {
    const hasSearchCenter = Boolean(
      explicitCenter
      || toPoint(props.profileCityCenter)
      || toPoint(props.selectedCityCoordinates)
      || hasExplicitMapCenter
      || mapMoved.current,
    );
    if (!hasSearchCenter) {
      setLocationMessage('Choose a city or tap My location before searching nearby.');
      return;
    }
    const mapCenterValue = mapRef.current?.getCenter();
    const center = explicitCenter ?? (mapCenterValue ? { lat: mapCenterValue.lat(), lng: mapCenterValue.lng() } : mapCenter);
    setMapCenter(center);
    setLocationMessage('');
    setSelectedPlace(null);
    hasInitialSearch.current = true;
    mapMoved.current = false;
    setSearchPending(false);
    setSearchToken((value) => value + 1);
  }, [hasExplicitMapCenter, mapCenter, props.profileCityCenter, props.selectedCityCoordinates]);

  const useMyLocation = useCallback(() => {
    setLocationMessage('');
    setLocationStatus('loading');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('idle');
      setLocationMessage('Location is unavailable in this browser. You can still explore the map.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        setHasExplicitMapCenter(true);
        setMapCenter(point);
        mapRef.current?.panTo(point);
        mapRef.current?.setZoom(12);
        setLocationStatus('idle');
        setLocationMessage('');
        searchArea(point);
      },
      (error) => {
        setLocationStatus('idle');
        setLocationMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow it in browser settings, then try again.'
          : 'Could not get your location. Check your connection and try again.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, [searchArea]);

  const initialCenter = useMemo(
    () => toPoint(props.profileCityCenter) ?? toPoint(props.selectedCityCoordinates) ?? DEFAULT_CENTER,
    [props.profileCityCenter?.latitude, props.profileCityCenter?.longitude, props.selectedCityCoordinates?.latitude, props.selectedCityCoordinates?.longitude],
  );

  const hasSearchCenter = Boolean(
    toPoint(props.profileCityCenter)
    || toPoint(props.selectedCityCoordinates)
    || hasExplicitMapCenter,
  );
  const sheetClearance = (props.sheetOverlayHeight ?? Math.min(208, Math.max(176, viewportHeight * 0.34))) + 9;
  useEffect(() => {
    if (!props.apiKey || mapFailed || mapReady) return;
    const timeout = setTimeout(() => setMapFailed(true), 15000);
    return () => clearTimeout(timeout);
  }, [props.apiKey, mapFailed, mapReady]);

  if (!props.apiKey || mapFailed) {
    return (
      <View style={[styles.fallbackRoot, { backgroundColor: colors.background }]} testID="explore-map-fallback">
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
          accessible
          accessibilityRole="alert"
          testID={mapFailed ? 'explore-map-error' : 'explore-map-configuration-notice'}
          style={[
            styles.fallbackNotice,
            { bottom: props.fullScreen ? sheetClearance + 8 : 12, backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.noticeTitle, { color: colors.foreground }]}>
            {mapFailed ? 'Map unavailable' : 'Google Maps is not configured'}
          </Text>
          <Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>
            {mapFailed
              ? 'Showing the community globe instead. Try again later.'
              : 'Showing the community globe. Nearby places need a Maps browser key.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <APIProvider apiKey={props.apiKey} libraries={['places']} onError={() => setMapFailed(true)}>
      <View style={[styles.root, { backgroundColor: colors.background }]} testID="explore-map">
        <GoogleMap
          defaultCenter={initialCenter}
          defaultZoom={props.profileCityCenter || props.selectedCityCoordinates ? 10 : 2}
          mapId="DEMO_MAP_ID"
          disableDefaultUI
          clickableIcons
          gestureHandling="greedy"
          onIdle={(event) => handleMapIdle(event.map)}
          onDrag={(event) => {
            mapRef.current = event.map;
            mapMoved.current = true;
             setHasExplicitMapCenter(true);
             setSelectedPlace(null);
          }}
          style={styles.map}
        >
          {props.cities.map((city) => {
            const positionKey = `${city.latitude.toFixed(5)},${city.longitude.toFixed(5)}`;
            const friendsInCity = friendCountsByPosition.get(positionKey) ?? 0;
            const activitySummary = props.verifiedActivityStatus === 'ready'
              ? `${city.participants} participants signed up; ${city.recentVerifiedCompletions} host-verified completions in the last 30 days`
              : props.verifiedActivityStatus === 'error'
                ? `${city.participants} participants signed up; recent host-verified activity unavailable`
                : `${city.participants} participants signed up; host-verified activity counts are loading`;
            const markerValue = props.mode === 'activity'
              ? city.participants
              : props.mode === 'impact'
                ? city.xpOffered
                : props.mode === 'social'
                  ? friendsInCity
                  : city.experiences;
            const markerDescription = props.mode === 'activity'
              ? `${city.city}: ${activitySummary}.`
              : props.mode === 'impact'
                ? `${city.city}: ${city.xpOffered.toLocaleString()} XP offered.`
                : props.mode === 'social'
                  ? `${city.city}: ${friendsInCity} friends at approximate profile cities.`
                  : `${city.city}: ${city.experiences} experiences.`;
            const markerColor = props.mode === 'activity'
              ? colors.teal
              : props.mode === 'impact'
                ? colors.violet
                : props.mode === 'social'
                  ? colors.violet
                  : colors.primary;
            return (
              <AdvancedMarker
                key={`city-${city.city}`}
                position={{ lat: city.latitude, lng: city.longitude }}
                title={markerDescription}
                onClick={() => {
                  props.onSelectCity(city.city);
                  focusOnCity(city.latitude, city.longitude);
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={markerDescription}
                  testID={`explore-map-city-${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onPress={() => {
                    props.onSelectCity(city.city);
                    focusOnCity(city.latitude, city.longitude);
                  }}
                  style={[styles.cityMarker, { backgroundColor: markerColor, borderColor: colors.card }]}
                >
                  <Text style={[styles.cityMarkerText, { color: colors.primaryForeground }]}>{markerValue.toLocaleString()}</Text>
                </Pressable>
              </AdvancedMarker>
            );
          })}
          {props.fullScreen && props.mode === 'explore' ? props.experienceLocations?.map((item) => (
            <AdvancedMarker
              key={`experience-${item.experienceId}`}
              position={{ lat: item.latitude, lng: item.longitude }}
              title={`${item.title} · rounded ${item.precision.replace('_', ' ')} location`}
              onClick={() => props.onSelectExperience?.(item.experienceId)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}. Rounded ${item.precision.replace('_', ' ')} location in ${item.city}.`}
                testID={`explore-map-experience-${item.experienceId}`}
                onPress={() => props.onSelectExperience?.(item.experienceId)}
                style={[styles.experienceMarker, { backgroundColor: colors.teal, borderColor: colors.card }]}
              >
                <Feather name="check" size={13} color={colors.primaryForeground} />
              </Pressable>
            </AdvancedMarker>
          )) : null}
          {(props.showFriends || props.mode === 'social') ? props.friends?.map((friend) => (
            <AdvancedMarker
              key={`friend-${friend.id}`}
              position={{ lat: friend.latitude, lng: friend.longitude }}
              title={`${friend.name} · approximate profile city: ${friend.city}`}
              onClick={() => props.onSelectFriend?.(friend.id)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${friend.name}'s profile. Approximate profile city: ${friend.city}.`}
                testID={`explore-map-friend-${friend.id}`}
                onPress={() => props.onSelectFriend?.(friend.id)}
                style={[styles.friendMarker, { backgroundColor: colors.violet, borderColor: colors.card }]}
              >
                <Text style={[styles.friendInitial, { color: colors.primaryForeground }]}>{friend.name.trim().charAt(0).toUpperCase()}</Text>
              </Pressable>
            </AdvancedMarker>
          )) : null}
          {places.map((place) => (
            <AdvancedMarker key={`amenity-${place.id}`} position={place.position} title={place.title} onClick={() => setSelectedPlace(place)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show details for ${place.title}${place.address ? `, ${place.address}` : ''}`}
                testID={`explore-map-place-${place.id}`}
                onPress={() => setSelectedPlace(place)}
                style={[styles.placeMarker, { backgroundColor: colors.card, borderColor: colors.teal }]}
              >
                <Feather name="map-pin" size={12} color={colors.teal} />
              </Pressable>
            </AdvancedMarker>
          ))}
        </GoogleMap>

        <NearbyLayer
          category={category}
          center={mapCenter}
          mapReady={mapReady}
          onPendingChange={setSearchPending}
          onStatus={setPlaceStatus}
          onResults={setPlaces}
          searchToken={searchToken}
        />
        <View pointerEvents="box-none" style={styles.controls}>
          {!mapReady ? (
            <View testID="explore-map-loading" style={[styles.statusCard, styles.mapLoading, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.foreground }]}>Loading map…</Text>
            </View>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="explore-nearby-category-list"
            style={styles.categoryScroller}
            contentContainerStyle={[styles.categoryTray, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {CATEGORIES.map((item) => {
              const selected = category === item.key;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Nearby ${item.label.toLowerCase()}`}
                  accessibilityState={{ selected }}
                  testID={`explore-nearby-category-${item.key}`}
                  onPress={() => {
                    if (category === item.key) return;
                    setCategory(item.key);
                    setPlaces([]);
                    setSelectedPlace(null);
                    setPlaceStatus('idle');
                    setSearchPending(true);
                  }}
                  style={[styles.categoryButton, { backgroundColor: selected ? colors.primary : 'transparent' }]}
                >
                  <Feather name={item.icon} size={14} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                  <Text style={[styles.categoryText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my location"
              accessibilityState={{ disabled: !mapReady || locationStatus === 'loading' }}
              testID="explore-map-use-location"
              disabled={!mapReady || locationStatus === 'loading'}
              onPress={useMyLocation}
              style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="crosshair" size={15} color={colors.foreground} />
              <Text style={[styles.actionText, { color: colors.foreground }]}>My location</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset map view"
              testID="explore-map-reset"
              onPress={() => { resetView(); props.onResetCity(); }}
              style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="rotate-ccw" size={16} color={colors.foreground} />
            </Pressable>
          </View>
          {searchPending && hasSearchCenter ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search this area for nearby places"
              testID="explore-map-search-area"
              onPress={() => searchArea()}
              style={[styles.searchButton, { backgroundColor: colors.primary }]}
            >
              <Feather name="search" size={15} color={colors.primaryForeground} />
              <Text style={[styles.searchButtonText, { color: colors.primaryForeground }]}>Search this area</Text>
            </Pressable>
          ) : null}
          {placeStatus !== 'idle' ? (
            <View
              accessible
              accessibilityRole={placeStatus === 'error' ? 'alert' : undefined}
              testID={`explore-map-nearby-${placeStatus}`}
              style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              {placeStatus === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              {placeStatus === 'error' ? (
                <>
                  <Text style={[styles.statusText, { color: colors.foreground }]}>Nearby places could not load.</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry nearby place search" testID="explore-map-retry-search" onPress={() => searchArea()}>
                    <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
                  </Pressable>
                </>
              ) : null}
              {placeStatus === 'empty' ? <Text style={[styles.statusText, { color: colors.foreground }]}>No nearby places in this category.</Text> : null}
              {placeStatus === 'ready' ? <Text style={[styles.statusText, { color: colors.foreground }]}>{places.length} nearby {places.length === 1 ? 'place' : 'places'} · up to 20</Text> : null}
            </View>
          ) : null}
          {!hasSearchCenter ? (
            <View testID="explore-map-location-needed" style={[styles.locationHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                No mapped profile-city center. Choose a city or tap My location to search nearby.
              </Text>
            </View>
          ) : null}
          {locationStatus === 'loading' ? (
            <View testID="explore-map-location-loading" style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.foreground }]}>Getting your location…</Text>
            </View>
          ) : null}
          {locationMessage ? (
            <View accessible accessibilityRole="alert" testID="explore-map-location-error" style={[styles.locationError, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statusText, { color: colors.foreground }]}>{locationMessage}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Try location again" testID="explore-map-location-retry" onPress={useMyLocation}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {selectedPlace ? (
            <View
              accessible
              accessibilityLabel={`${selectedPlace.title}${selectedPlace.address ? `, ${selectedPlace.address}` : ''}`}
              testID="explore-map-selected-place-detail"
              style={[styles.placeDetail, { bottom: sheetClearance + 47, backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.placeDetailCopy}>
                <Text numberOfLines={1} style={[styles.placeDetailTitle, { color: colors.foreground }]}>{selectedPlace.title}</Text>
                <Text numberOfLines={2} style={[styles.placeDetailAddress, { color: colors.mutedForeground }]}>
                  {selectedPlace.address ?? 'Address not provided by Places.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${selectedPlace.title} details`}
                testID="explore-map-close-place-detail"
                onPress={() => setSelectedPlace(null)}
                style={styles.closeDetailButton}
              >
                <Feather name="x" size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.disclaimer, { bottom: sheetClearance, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
              Google Maps labels are broader. Nearby search returns up to 20 places, not every place. City and friend pins are approximate.
            </Text>
          </View>
        </View>
      </View>
    </APIProvider>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
  fallbackRoot: { flex: 1, minHeight: 0 },
  fallbackNotice: { position: 'absolute', left: 12, width: 212, bottom: 12, borderRadius: 12, borderWidth: 1, padding: 12, pointerEvents: 'none' },
  noticeTitle: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  noticeCopy: { fontSize: 11, lineHeight: 15 },
  controls: { ...StyleSheet.absoluteFill, paddingTop: 214, paddingHorizontal: 10, alignItems: 'flex-start' },
  categoryTray: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, alignItems: 'center', gap: 2 },
  categoryScroller: { width: '100%', flexGrow: 0, borderRadius: 14 },
  categoryButton: { minHeight: 36, paddingHorizontal: 9, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  actionButton: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionText: { fontSize: 12, fontWeight: '600' },
  iconButton: { height: 40, width: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchButton: { marginTop: 9, minHeight: 42, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 3 },
  searchButtonText: { fontSize: 13, fontWeight: '700' },
  statusCard: { marginTop: 8, minHeight: 34, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '90%' },
  mapLoading: { marginTop: 0, marginBottom: 8 },
  statusText: { fontSize: 11, lineHeight: 15 },
  retryText: { fontSize: 12, fontWeight: '700', paddingLeft: 5 },
  locationError: { marginTop: 8, borderWidth: 1, borderRadius: 10, padding: 10, maxWidth: '94%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationHint: { marginTop: 8, borderWidth: 1, borderRadius: 10, padding: 9, maxWidth: '94%' },
  disclaimer: { position: 'absolute', left: 0, right: 0, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  disclaimerText: { fontSize: 10, lineHeight: 14 },
  placeDetail: { position: 'absolute', left: 0, right: 0, minHeight: 56, borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 7, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeDetailCopy: { flex: 1, minWidth: 0 },
  placeDetailTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  placeDetailAddress: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  closeDetailButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cityMarker: { minWidth: 34, height: 34, paddingHorizontal: 7, borderWidth: 2, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cityMarkerText: { fontSize: 11, fontWeight: '700' },
  experienceMarker: { width: 27, height: 27, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  friendMarker: { width: 33, height: 33, borderWidth: 2, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  friendInitial: { fontSize: 13, fontWeight: '700' },
  placeMarker: { width: 27, height: 27, borderWidth: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

export default ExploreMap;
