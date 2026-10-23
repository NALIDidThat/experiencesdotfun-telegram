import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExploreGlobe } from '@/components/ExploreGlobe';
import { useColors } from '@/hooks/useColors';
import type { ExploreMapCategory, ExploreMapHandle, ExploreMapProps } from '@/components/ExploreMap.types';

type Point = { lat: number; lng: number };
type NearbyPlace = { id: string; name: string; address?: string | null; position: Point };
type NearbyPlaceDetails = {
  businessStatus?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  websiteURI?: string | null;
  internationalPhoneNumber?: string | null;
};
type GoogleMapInstance = NonNullable<ReturnType<typeof useMap>>;
type SearchPlace = {
  id?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat: () => number; lng: () => number } | null;
};
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
      fields: ['id', 'displayName', 'location', 'formattedAddress'],
      locationRestriction: { center, radius: 3200 },
      ...(activeCategory?.types ? { includedTypes: activeCategory.types } : {}),
      maxResultCount: 20,
    }).then((result: { places: SearchPlace[] }) => {
      if (cancelled) return;
      const places = result.places.flatMap((place: SearchPlace) => (
        place.location ? [{
          id: place.id ?? `nearby-${place.location.lat()}-${place.location.lng()}`,
          name: place.displayName ?? 'Nearby place',
          address: place.formattedAddress,
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

function MapCameraTracker({ onIdle }: { onIdle: (map: GoogleMapInstance) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    onIdle(map);
    const listener = map.addListener('idle', () => onIdle(map));
    return () => listener.remove();
  }, [map, onIdle]);
  return null;
}

const ExploreMapGoogle3D = React.forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMapGoogle3D(props, ref) {
  const colors = useColors();
  const fallbackRef = useRef<ExploreMapHandle>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [category, setCategory] = useState<ExploreMapCategory>('all');
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<NearbyPlaceDetails | null>(null);
  const [placeDetailsStatus, setPlaceDetailsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [nearbyStatus, setNearbyStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  const [searchToken, setSearchToken] = useState(0);
  const [locationMessage, setLocationMessage] = useState('');
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const placesLibrary = useMapsLibrary('places');
  const resetCenter = point(props.profileCityCenter) ?? { lat: 20, lng: 0 };
  const initialCenter = point(props.profileCityCenter) ?? point(props.selectedCityCoordinates) ?? resetCenter;
  const initialSearchCenter = point(props.profileCityCenter);
  const mapCenter = useRef<Point>(initialCenter);
  const [searchCenter, setSearchCenter] = useState<Point>(initialSearchCenter ?? initialCenter);
  const initialSearchStarted = useRef(false);
  const placeDetailsRequestId = useRef<string | null>(null);
  const initialZoom = props.profileCityCenter || props.selectedCityCoordinates ? 12 : 2;

  useEffect(() => {
    if (props.sheetExpanded) setMapToolsOpen(false);
  }, [props.sheetExpanded]);

  useEffect(() => {
    mapCenter.current = initialCenter;
  }, [
    initialCenter.lat,
    initialCenter.lng,
  ]);

  const onMapIdle = useCallback((map: GoogleMapInstance) => {
    mapRef.current = map;
    const center = map.getCenter();
    if (center) mapCenter.current = { lat: center.lat(), lng: center.lng() };
    setMapReady(true);
    if (initialSearchCenter && !initialSearchStarted.current) {
      initialSearchStarted.current = true;
      setSearchCenter(initialSearchCenter);
      setSearchToken(1);
    }
  }, [initialSearchCenter?.lat, initialSearchCenter?.lng]);

  const focusOnCity = useCallback((latitude: number, longitude: number) => {
    mapCenter.current = { lat: latitude, lng: longitude };
    mapRef.current?.setCenter({ lat: latitude, lng: longitude });
    mapRef.current?.setZoom(12);
  }, []);
  const resetMapView = useCallback(() => {
    if (!props.apiKey || failed) {
      fallbackRef.current?.resetView();
    } else {
      mapRef.current?.setCenter(resetCenter);
      mapRef.current?.setZoom(props.profileCityCenter ? 12 : 2);
    }
    mapCenter.current = resetCenter;
    setNearby([]);
    setSelectedPlace(null);
    setSelectedPlaceDetails(null);
    setPlaceDetailsStatus('idle');
    placeDetailsRequestId.current = null;
    setNearbyStatus('idle');
    setLocationMessage('');
  }, [failed, props.apiKey, props.profileCityCenter, resetCenter.lat, resetCenter.lng]);

  React.useImperativeHandle(ref, () => ({
    focusOnCity: (latitude, longitude) => {
      if (!props.apiKey || failed) {
        fallbackRef.current?.focusOnCity(latitude, longitude);
        return;
      }
      focusOnCity(latitude, longitude);
    },
    resetView: resetMapView,
  }), [failed, focusOnCity, props.apiKey, resetMapView]);

  // Keep camera movement in a ref; a Places request captures this centre only when the user searches.
  const searchArea = useCallback(() => {
    setNearby([]);
    setSelectedPlace(null);
    setSelectedPlaceDetails(null);
    setPlaceDetailsStatus('idle');
    placeDetailsRequestId.current = null;
    setNearbyStatus('loading');
    setLocationMessage('');
    setSearchCenter(mapCenter.current);
    setSearchToken((value) => value + 1);
  }, []);

  const updateNearby = useCallback((places: NearbyPlace[]) => {
    setNearby(places);
    setSelectedPlace(null);
    setSelectedPlaceDetails(null);
    setPlaceDetailsStatus('idle');
    placeDetailsRequestId.current = null;
  }, []);

  const selectNearbyPlace = useCallback(async (place: NearbyPlace) => {
    setSelectedPlace(place);
    setSelectedPlaceDetails(null);
    setPlaceDetailsStatus('loading');
    placeDetailsRequestId.current = place.id;
    mapRef.current?.panTo(place.position);
    mapRef.current?.setZoom(Math.max(mapRef.current?.getZoom() ?? 0, 14));

    if (!placesLibrary || place.id.startsWith('nearby-')) {
      setPlaceDetailsStatus(place.id.startsWith('nearby-') ? 'ready' : 'error');
      return;
    }

    try {
      const { place: details } = await new placesLibrary.Place({ id: place.id }).fetchFields({
        fields: ['businessStatus', 'rating', 'userRatingCount', 'websiteURI', 'internationalPhoneNumber'],
      });
      if (placeDetailsRequestId.current !== place.id) return;
      setSelectedPlaceDetails({
        businessStatus: details.businessStatus,
        rating: details.rating,
        userRatingCount: details.userRatingCount,
        websiteURI: details.websiteURI,
        internationalPhoneNumber: details.internationalPhoneNumber,
      });
      setPlaceDetailsStatus('ready');
    } catch {
      if (placeDetailsRequestId.current === place.id) setPlaceDetailsStatus('error');
    }
  }, [placesLibrary]);

  const findMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.');
      return;
    }
    setLocationMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        mapCenter.current = next;
        setNearby([]);
        setSelectedPlace(null);
        setSelectedPlaceDetails(null);
        setPlaceDetailsStatus('idle');
        placeDetailsRequestId.current = null;
        setNearbyStatus('idle');
        mapRef.current?.panTo(next);
        mapRef.current?.setZoom(14);
        setLocationMessage('Showing your approximate current location.');
      },
      () => setLocationMessage('Could not get your location. Check your browser permission.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, []);

  const nearbyStatusMessage = nearbyStatus === 'loading'
    ? 'Searching nearby…'
    : nearbyStatus === 'ready'
      ? `${nearby.length} nearby places`
      : nearbyStatus === 'empty'
        ? 'No nearby places found'
        : nearbyStatus === 'error'
          ? 'Nearby places could not load'
          : '';
  const mapStatusMessage = locationMessage || nearbyStatusMessage || (!mapReady ? 'Loading Google Maps…' : '');
  const mapStatusTestID = locationMessage
    ? 'explore-map-location-status'
    : nearbyStatus !== 'idle'
      ? `explore-map-nearby-${nearbyStatus}`
      : 'explore-map-loading';

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
          sheetOverlayHeight={props.sheetOverlayHeight}
          sheetExpanded={props.sheetExpanded}
          showFriends={props.showFriends}
          onSelectCity={props.onSelectCity}
          onSelectFriend={props.onSelectFriend}
          onSelectExperience={props.onSelectExperience}
          onExploreCity={props.onExploreCity}
          onResetCity={props.onResetCity}
        />
        {!props.sheetExpanded ? (
          <View
            testID="explore-map-configuration-notice"
            style={[
              styles.notice,
              { backgroundColor: colors.card, borderColor: colors.border },
              { bottom: Math.max(12, (props.sheetOverlayHeight ?? 0) + 12) },
            ]}
          >
              <Text style={{ color: colors.foreground }}>
                {props.apiKey ? 'Google Maps unavailable' : 'Google Maps key not configured'}
              </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <APIProvider apiKey={props.apiKey} libraries={['maps', 'marker', 'places']} onError={() => setFailed(true)}>
      <View style={styles.root} testID="explore-map">
        <GoogleMap
          id="explore-google-map"
          mapId="DEMO_MAP_ID"
          mapTypeId="roadmap"
          gestureHandling="greedy"
          defaultCenter={initialCenter}
          defaultZoom={initialZoom}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          onCameraChanged={(event) => {
            mapCenter.current = { lat: event.detail.center.lat, lng: event.detail.center.lng };
          }}
          style={styles.map}
        >
          <MapCameraTracker onIdle={onMapIdle} />
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
              <AdvancedMarker
                key={`city-${city.city}`}
                position={{ lat: city.latitude, lng: city.longitude }}
                title={description}
                onClick={() => {
                  props.onSelectCity(city.city);
                  focusOnCity(city.latitude, city.longitude);
                }}
              >
                <View style={[styles.cityMarker, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                  <Text style={[styles.markerLabel, { color: colors.primaryForeground }]}>{count > 99 ? '99+' : count}</Text>
                </View>
              </AdvancedMarker>
            );
          })}
          {props.fullScreen && props.mode === 'explore' ? props.experienceLocations?.map((item) => (
            <AdvancedMarker
              key={`experience-${item.experienceId}`}
              position={{ lat: item.latitude, lng: item.longitude }}
              title={`${item.title} · approximate ${item.precision.replace('_', ' ')} location`}
              onClick={() => props.onSelectExperience?.(item.experienceId)}
            >
              <View style={[styles.experienceMarker, { backgroundColor: colors.teal, borderColor: colors.card }]}>
                <Feather name="check" size={14} color={colors.primaryForeground} />
              </View>
            </AdvancedMarker>
          )) : null}
          {(props.showFriends || props.mode === 'social') ? props.friends?.map((friend) => (
            <AdvancedMarker
              key={`friend-${friend.id}`}
              position={{ lat: friend.latitude, lng: friend.longitude }}
              title={`${friend.name} · approximate profile city: ${friend.city}`}
              onClick={() => props.onSelectFriend?.(friend.id)}
            >
              <View style={[styles.friendMarker, { backgroundColor: colors.violet, borderColor: colors.card }]}>
                <Text style={[styles.markerLabel, { color: colors.primaryForeground }]}>{friend.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
            </AdvancedMarker>
          )) : null}
          {nearby.map((place, index) => (
            <AdvancedMarker
              key={place.id}
              position={place.position}
              title={place.name}
              onClick={() => { void selectNearbyPlace(place); }}
            >
              <View style={[
                styles.businessMarker,
                {
                  backgroundColor: selectedPlace?.id === place.id ? colors.primary : colors.card,
                  borderColor: colors.primary,
                },
              ]}>
                <Text style={[
                  styles.markerLabel,
                  { color: selectedPlace?.id === place.id ? colors.primaryForeground : colors.primary },
                ]}>{index + 1}</Text>
              </View>
            </AdvancedMarker>
          ))}
        </GoogleMap>
        {searchToken > 0 ? (
          <NearbySearch
            center={searchCenter}
            category={category}
            token={searchToken}
            onStatus={setNearbyStatus}
            onResults={updateNearby}
          />
        ) : null}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {mapToolsOpen && !props.sheetExpanded ? (
            <View
              testID="explore-map-tools-panel"
              style={[
                styles.toolsPanel,
                {
                  bottom: Math.max(16, (props.sheetOverlayHeight ?? 0) + 16),
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.toolsHeading}>
                <View style={styles.toolsHeadingCopy}>
                  <Text style={[styles.toolsTitle, { color: colors.foreground }]}>Nearby places</Text>
                  <Text style={[styles.toolsSubtitle, { color: colors.mutedForeground }]}>Google businesses around this map area</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close map tools"
                  testID="explore-map-tools-close"
                  onPress={() => setMapToolsOpen(false)}
                  style={styles.closeToolsButton}
                >
                  <Feather name="x" size={17} color={colors.mutedForeground} />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categories}
                testID="explore-nearby-category-list"
              >
                {CATEGORIES.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Search nearby ${item.label.toLowerCase()} places`}
                    accessibilityState={{ selected: item.id === category }}
                    testID={`explore-nearby-category-${item.id}`}
                    onPress={() => { setCategory(item.id); searchArea(); }}
                    style={[
                      styles.category,
                      {
                        backgroundColor: item.id === category ? colors.primary : colors.muted,
                        borderColor: item.id === category ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: item.id === category ? colors.primaryForeground : colors.foreground }}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Show my location"
                  testID="explore-map-my-location"
                  onPress={findMyLocation}
                  style={[styles.action, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <Feather name="crosshair" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground }}>Locate</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={nearbyStatus === 'loading' ? 'Searching nearby places' : 'Search nearby places'}
                  testID="explore-map-search-area"
                  onPress={searchArea}
                  style={[styles.action, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <Feather name="search" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground }}>{nearbyStatus === 'loading' ? 'Searching' : 'Search'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset map view"
                  testID="explore-map-reset"
                  onPress={props.onResetCity}
                  style={[styles.action, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <Feather name="rotate-ccw" size={14} color={colors.foreground} />
                  <Text style={{ color: colors.foreground }}>Reset</Text>
                </Pressable>
              </View>
              {mapStatusMessage ? (
                <View testID={mapStatusTestID} style={[styles.status, { backgroundColor: colors.muted }]}>
                  <Text style={{ color: colors.foreground }}>{mapStatusMessage}</Text>
                </View>
              ) : null}
              {selectedPlace ? (
                <View
                  testID="explore-nearby-place-details"
                  style={[styles.placeDetails, { backgroundColor: colors.muted, borderColor: colors.border }]}
                >
                  <View style={styles.placeDetailsHeading}>
                    <View style={styles.placeDetailsCopy}>
                      <Text numberOfLines={1} style={[styles.placeDetailsName, { color: colors.foreground }]}>
                        {selectedPlace.name}
                      </Text>
                      {selectedPlace.address ? (
                        <Text numberOfLines={2} style={[styles.placeDetailsAddress, { color: colors.mutedForeground }]}>
                          {selectedPlace.address}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close business details"
                      testID="explore-nearby-place-details-close"
                      onPress={() => {
                        placeDetailsRequestId.current = null;
                        setSelectedPlace(null);
                        setSelectedPlaceDetails(null);
                        setPlaceDetailsStatus('idle');
                      }}
                      style={styles.closeToolsButton}
                    >
                      <Feather name="x" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  {placeDetailsStatus === 'loading' ? (
                    <Text style={[styles.placeDetailsMeta, { color: colors.mutedForeground }]}>Loading business details…</Text>
                  ) : placeDetailsStatus === 'error' ? (
                    <Text testID="explore-nearby-place-details-error" style={[styles.placeDetailsMeta, { color: colors.mutedForeground }]}>
                      More business details couldn’t be loaded. The name and address are still available.
                    </Text>
                  ) : placeDetailsStatus === 'ready' ? (
                    <>
                      <View testID="explore-nearby-place-details-loaded" style={styles.placeDetailsInfo}>
                        {selectedPlaceDetails?.rating != null ? (
                          <Text style={[styles.placeDetailsMeta, { color: colors.foreground }]}>
                            ★ {selectedPlaceDetails.rating.toFixed(1)}
                            {selectedPlaceDetails.userRatingCount != null
                              ? ` · ${selectedPlaceDetails.userRatingCount.toLocaleString()} ratings`
                              : ''}
                          </Text>
                        ) : null}
                        {selectedPlaceDetails?.businessStatus ? (
                          <Text style={[styles.placeDetailsMeta, { color: colors.mutedForeground }]}>
                            {selectedPlaceDetails.businessStatus === 'OPERATIONAL'
                              ? 'Operating'
                              : selectedPlaceDetails.businessStatus === 'CLOSED_TEMPORARILY'
                                ? 'Temporarily closed'
                                : selectedPlaceDetails.businessStatus === 'CLOSED_PERMANENTLY'
                                  ? 'Permanently closed'
                                  : 'Business status unavailable'}
                          </Text>
                        ) : null}
                      </View>
                      {selectedPlaceDetails?.websiteURI || selectedPlaceDetails?.internationalPhoneNumber ? (
                        <View style={styles.detailsActions}>
                          {selectedPlaceDetails.websiteURI ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${selectedPlace.name} website`}
                              testID="explore-nearby-place-website"
                              onPress={() => {
                                void Linking.openURL(selectedPlaceDetails.websiteURI!).catch(() => setLocationMessage('Could not open this business website.'));
                              }}
                              style={[styles.detailsAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                            >
                              <Feather name="external-link" size={13} color={colors.primary} />
                              <Text style={[styles.detailsActionText, { color: colors.primary }]}>Website</Text>
                            </Pressable>
                          ) : null}
                          {selectedPlaceDetails.internationalPhoneNumber ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Call ${selectedPlace.name}`}
                              testID="explore-nearby-place-call"
                              onPress={() => {
                                void Linking.openURL(`tel:${selectedPlaceDetails.internationalPhoneNumber}`).catch(() => setLocationMessage('Could not start a call to this business.'));
                              }}
                              style={[styles.detailsAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                            >
                              <Feather name="phone" size={13} color={colors.primary} />
                              <Text style={[styles.detailsActionText, { color: colors.primary }]}>Call</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${selectedPlace.name} in Google Maps`}
                    testID="explore-nearby-place-open-google-maps"
                    onPress={() => {
                      const url = selectedPlace.id.startsWith('nearby-')
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedPlace.name} ${selectedPlace.position.lat},${selectedPlace.position.lng}`)}`
                        : `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(selectedPlace.id)}`;
                      void Linking.openURL(url).catch(() => setLocationMessage('Could not open this place in Google Maps.'));
                    }}
                    style={[styles.openPlaceButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Feather name="map" size={14} color={colors.primary} />
                    <Text style={[styles.openPlaceButtonText, { color: colors.primary }]}>View in Google Maps</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.resultsHeading}>
                <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Places in this area</Text>
                <Text testID="explore-nearby-place-count" style={[styles.resultsCount, { color: colors.mutedForeground }]}>
                  {nearbyStatus === 'ready' ? nearby.length : nearbyStatus === 'loading' ? '…' : nearby.length}
                </Text>
              </View>
              {nearbyStatus === 'loading' ? (
                <Text testID="explore-nearby-place-list-loading" style={[styles.resultsMessage, { color: colors.mutedForeground }]}>
                  Searching for nearby businesses…
                </Text>
              ) : nearbyStatus === 'error' ? (
                <Text testID="explore-nearby-place-list-error" style={[styles.resultsMessage, { color: colors.mutedForeground }]}>
                  Businesses couldn’t be loaded. Search this area to try again.
                </Text>
              ) : nearbyStatus === 'empty' ? (
                <Text testID="explore-nearby-place-list-empty" style={[styles.resultsMessage, { color: colors.mutedForeground }]}>
                  No nearby businesses found. Try another category or search area.
                </Text>
              ) : nearby.length ? (
                <>
                  <ScrollView
                    testID="explore-nearby-place-list"
                    style={styles.placesList}
                    contentContainerStyle={styles.placesListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {nearby.map((place, index) => (
                      <Pressable
                        key={place.id}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${place.name}${place.address ? `, ${place.address}` : ''}`}
                        accessibilityState={{ selected: selectedPlace?.id === place.id }}
                        testID={`explore-nearby-place-${index}`}
                        onPress={() => { void selectNearbyPlace(place); }}
                        style={[
                          styles.nearbyPlaceRow,
                          { borderBottomColor: colors.border },
                          selectedPlace?.id === place.id && { backgroundColor: colors.primary + '0A' },
                        ]}
                      >
                        <View style={[styles.placeIndex, { backgroundColor: colors.primary + '12' }]}>
                          <Text style={[styles.placeIndexText, { color: colors.primary }]}>{index + 1}</Text>
                        </View>
                        <View style={styles.nearbyPlaceCopy}>
                          <Text numberOfLines={1} style={[styles.nearbyPlaceName, { color: colors.foreground }]}>
                            {place.name}
                          </Text>
                          <Text numberOfLines={1} style={[styles.nearbyPlaceAddress, { color: colors.mutedForeground }]}>
                            {place.address ?? 'Tap to view this place'}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={[styles.googleAttribution, { color: colors.mutedForeground }]}>Powered by Google</Text>
                </>
              ) : (
                <Text testID="explore-nearby-place-list-idle" style={[styles.resultsMessage, { color: colors.mutedForeground }]}>
                  Search this area to view nearby Google businesses.
                </Text>
              )}
            </View>
          ) : null}
          {!props.sheetExpanded && !mapToolsOpen ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={nearby.length
              ? `Open nearby places list with ${nearby.length} results`
              : 'Open nearby places and map tools'}
            accessibilityHint="Nearby search, location, and map reset controls"
            accessibilityState={{ expanded: mapToolsOpen }}
            testID="explore-map-tools-toggle"
            onPress={() => setMapToolsOpen((open) => !open)}
            style={[
              styles.toolsToggle,
              {
                bottom: Math.max(16, (props.sheetOverlayHeight ?? 0) + 16),
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="list" size={17} color={colors.foreground} />
            <Text style={[styles.toolsToggleText, { color: colors.foreground }]}>
              {nearby.length ? `Places · ${nearby.length}` : 'Nearby places'}
            </Text>
          </Pressable> : null}
        </View>
      </View>
    </APIProvider>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#071f3d' },
  map: { width: '100%', height: '100%' },
  toolsToggle: { position: 'absolute', right: 14, minHeight: 44, borderWidth: 1, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  toolsToggleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  toolsPanel: { position: 'absolute', left: 12, right: 12, borderWidth: 1, borderRadius: 18, padding: 12, gap: 9, maxHeight: 400, overflow: 'hidden' },
  toolsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolsHeadingCopy: { flex: 1, minWidth: 0 },
  toolsTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  toolsSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  closeToolsButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  categories: { flexDirection: 'row', gap: 6, paddingRight: 2 },
  category: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  actions: { flexDirection: 'row', gap: 7 },
  action: { flex: 1, minWidth: 0, height: 40, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  status: { alignSelf: 'stretch', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  resultsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  resultsTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  resultsCount: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  resultsMessage: { fontSize: 11, lineHeight: 16 },
  placesList: { flexGrow: 0, flexShrink: 1, maxHeight: 140 },
  placesListContent: { paddingBottom: 2 },
  nearbyPlaceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  placeIndex: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  placeIndexText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  nearbyPlaceCopy: { flex: 1, minWidth: 0, gap: 2 },
  nearbyPlaceName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  nearbyPlaceAddress: { fontSize: 10, lineHeight: 14 },
  googleAttribution: { fontSize: 9, textAlign: 'right' },
  placeDetails: { borderWidth: 1, borderRadius: 12, padding: 9, gap: 6 },
  placeDetailsHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  placeDetailsCopy: { flex: 1, minWidth: 0, gap: 3 },
  placeDetailsName: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  placeDetailsAddress: { fontSize: 10, lineHeight: 14 },
  placeDetailsInfo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  placeDetailsMeta: { fontSize: 10, lineHeight: 14 },
  detailsActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailsAction: { minHeight: 32, borderWidth: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 9 },
  detailsActionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  openPlaceButton: { minHeight: 34, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  openPlaceButtonText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  cityMarker: { minWidth: 34, height: 34, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  businessMarker: { minWidth: 28, height: 28, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  experienceMarker: { width: 27, height: 27, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  friendMarker: { width: 29, height: 29, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markerLabel: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  notice: { position: 'absolute', left: 12, bottom: 12, borderWidth: 1, padding: 12, borderRadius: 10 },
});

export default ExploreMapGoogle3D;
