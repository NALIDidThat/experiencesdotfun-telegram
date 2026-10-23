import React, { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Svg, Circle, ClipPath, Defs, Ellipse, G, Line, Path, RadialGradient, Stop, SvgText } from '@/components/SvgCompat';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { UserAvatar } from '@/components/UserAvatar';
import naturalEarthLand from '@/assets/ne_110m_land.json';

export type GlobeCity = {
  city: string;
  latitude: number;
  longitude: number;
  country?: string | null;
  experiences: number;
  openExperiences: number;
  participants: number;
  places: number;
  xpOffered: number;
  recentVerifiedCompletions: number;
  categoryCounts: Partial<Record<'environmental' | 'education' | 'community', number>>;
};

export type GlobeMode = 'explore' | 'social' | 'activity' | 'impact';

export type GlobeFriend = {
  id: number;
  name: string;
  avatarUrl: string | null;
  city: string;
  latitude: number;
  longitude: number;
};

export type GlobeExperienceLocation = {
  experienceId: number;
  title: string;
  city: string;
  latitude: number;
  longitude: number;
  precision: 'city' | 'neighborhood' | 'venue_area';
};

export type WelcomeGlobeActivityCity = {
  city: string;
  latitude: number;
  longitude: number;
  verifiedCompletions: number;
};

type Props = {
  cities: GlobeCity[];
  friends?: GlobeFriend[];
  experienceLocations?: GlobeExperienceLocation[];
  mode: GlobeMode;
  selectedCity: string | null;
  selectedCityCoordinates?: { latitude: number; longitude: number };
  status: 'loading' | 'ready' | 'error';
  verifiedActivityStatus?: 'loading' | 'ready' | 'error';
  fullScreen?: boolean;
  sheetOverlayHeight?: number;
  sheetExpanded?: boolean;
  locationPicker?: boolean;
  showFriends?: boolean;
  welcomeMode?: boolean;
  welcomeActivityCities?: WelcomeGlobeActivityCity[];
  welcomeActivityWindowDays?: number;
  welcomeActivityCityCount?: number;
  onSelectCity: (city: string) => void;
  onSelectFriend?: (friendId: number) => void;
  onSelectExperience?: (experienceId: number) => void;
  onExploreCity: (city: string) => void;
  onResetCity: () => void;
};

export type ExploreGlobeHandle = {
  focusOnCity: (latitude: number, longitude: number) => void;
  resetView: () => void;
};

export type GlobeEngine = React.ForwardRefExoticComponent<Props & React.RefAttributes<ExploreGlobeHandle>>;

const WIDTH = 340;
const HEIGHT = 300;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 151;
const BASE_RADIUS = 119;
const FULLSCREEN_RADIUS = 140;
type LandGeometry =
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };
// Bundled Natural Earth 1:110m public-domain land geometry keeps the globe detailed and offline.
const LAND_POLYGONS: Array<Array<[number, number]>> = (
  naturalEarthLand as unknown as { features: Array<{ geometry: LandGeometry }> }
).features.flatMap(({ geometry }) => (
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
));
const EARTH_PALETTE = {
  oceanLight: '#438fa9',
  oceanMid: '#126182',
  oceanDeep: '#071f3d',
  landGreen: '#7b9c62',
  landWarm: '#b6a477',
  landHigh: '#ded4b5',
  coast: '#d8e8d0',
  atmosphere: '#8ed4ef',
};

const CITY_LIGHTS: Array<[number, number, number]> = [
  [-74, 41, 1.5], [-0.1, 51.5, 1.4], [2.35, 48.86, 1.5], [13.4, 52.5, 1.1],
  [12.5, 41.9, 1.1], [28.9, 41, 1.2], [31.2, 30, 1.3], [3.4, 6.5, 1.1],
  [36.8, -1.3, 1], [55.3, 25.2, 1.2], [72.9, 19.1, 1.5], [77.2, 28.6, 1.4],
  [90.4, 23.8, 1.1], [103.8, 1.3, 1], [103.8, 36, 1.5], [116.4, 39.9, 1.5],
  [121.5, 31.2, 1.5], [126.9, 37.5, 1.2], [139.7, 35.7, 1.5], [-99.1, 19.4, 1.2],
  [-46.6, -23.5, 1.1], [-58.4, -34.6, 0.9], [151.2, -33.9, 1.1], [144.9, -37.8, 0.9],
  [-3.7, 40.4, 1], [18.4, -33.9, 0.9], [44.4, 33.3, 1], [-122.4, 37.8, 1.1],
  [-118.2, 34, 1.2], [-87.6, 41.9, 1], [-99.1, 32.8, 0.9], [106.8, -6.2, 1.2],
];

const STAR_FIELD: Array<[number, number, number]> = [
  [18, 38, 1], [42, 112, 1.2], [64, 207, 0.8], [33, 263, 1], [296, 30, 1],
  [314, 75, 0.8], [287, 130, 1.1], [309, 198, 0.8], [292, 250, 1.2], [22, 164, 0.7],
  [73, 24, 0.7], [260, 18, 0.8], [80, 274, 0.8], [252, 277, 1], [12, 92, 0.7],
  [328, 155, 0.7], [272, 96, 0.8], [57, 80, 0.9], [307, 282, 0.7], [41, 229, 0.8],
  [6, 18, 1.2], [337, 44, 1.1], [8, 214, 1], [334, 235, 1.2], [116, 10, 0.8],
  [225, 8, 1], [5, 286, 0.8], [335, 286, 0.9], [105, 292, 0.7], [233, 291, 0.8],
  [25, 129, 0.8], [320, 110, 0.9],
];

function project(latitude: number, longitude: number, rotation: number, tilt: number, radius: number) {
  const lat = (latitude * Math.PI) / 180;
  const lon = ((longitude + rotation) * Math.PI) / 180;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = -Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  const tiltedY = y * Math.cos(tilt) - z * Math.sin(tilt);
  const tiltedZ = y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x: CENTER_X + x * radius, y: CENTER_Y + tiltedY * radius, z: tiltedZ };
}

function polygonPath(points: Array<[number, number]>, rotation: number, tilt: number, radius: number) {
  const projected = points.map(([longitude, latitude]) => project(latitude, longitude, rotation, tilt, radius));
  let path = '';
  let drawing = false;
  projected.forEach((point) => {
    if (point.z > 0.04) {
      path += `${drawing ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
      drawing = true;
    } else {
      drawing = false;
    }
  });
  return path;
}

const SvgGlobeEngine = React.forwardRef<ExploreGlobeHandle, Props>(function SvgGlobeEngine({
  cities,
  friends = [],
  experienceLocations = [],
  mode,
  selectedCity,
  selectedCityCoordinates,
  status,
  verifiedActivityStatus = 'loading',
  fullScreen = false,
  sheetOverlayHeight = 0,
  sheetExpanded = false,
  locationPicker = false,
  showFriends = false,
  welcomeMode = false,
  welcomeActivityCities = [],
  welcomeActivityWindowDays = 30,
  welcomeActivityCityCount = 0,
  onSelectCity,
  onSelectFriend,
  onSelectExperience,
  onExploreCity,
  onResetCity,
}: Props, ref) {
  const colors = useColors();
  const welcomeColors = colors.welcome;
  const isEarthGlobe = locationPicker || welcomeMode;
  const hasWelcomeGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const space = {
    background: colors.background,
    foreground: colors.foreground,
    muted: colors.mutedForeground,
    subdued: colors.mutedForeground,
    surface: colors.card,
    border: colors.border,
  };
  const [rotation, setRotation] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [globeInteracting, setGlobeInteracting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const markerPulse = useRef(new Animated.Value(1)).current;
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const dragOrigin = useRef({ rotation: 0, tilt: 0 });
  const touchOrigin = useRef({ x: 0, y: 0, active: false, distance: 0, zoom: 1 });
  const currentRotation = useRef(rotation);
  const currentTilt = useRef(tilt);
  const currentZoom = useRef(zoom);
  const pinchOrigin = useRef({ distance: 0, zoom: 1 });
  currentRotation.current = rotation;
  currentTilt.current = tilt;
  currentZoom.current = zoom;
  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (mounted) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, gesture) => (
      (event.nativeEvent.touches?.length ?? 0) > 1
      || Math.abs(gesture.dx) > 5
      || Math.abs(gesture.dy) > 8
    ),
    onPanResponderGrant: (event) => {
      dragOrigin.current = { rotation: currentRotation.current, tilt: currentTilt.current };
      const touches = event.nativeEvent.touches;
      if (touches?.length > 1) {
        const [first, second] = touches;
        pinchOrigin.current = {
          distance: Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY),
          zoom: currentZoom.current,
        };
      }
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches?.length > 1 && pinchOrigin.current.distance > 0) {
        const [first, second] = touches;
        const distance = Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
        setZoom(Math.max(0.82, Math.min(1.2, pinchOrigin.current.zoom * distance / pinchOrigin.current.distance)));
        return;
      }
      setRotation(dragOrigin.current.rotation + gesture.dx * 0.72);
      setTilt(Math.max(-0.55, Math.min(0.55, dragOrigin.current.tilt + gesture.dy / 360)));
    },
  }), []);
  const selected = cities.find((item) => item.city === selectedCity) ?? null;
  const locationTarget = selectedCityCoordinates
    ? `${selectedCityCoordinates.latitude},${selectedCityCoordinates.longitude}`
    : null;
  const previousLocationTarget = useRef<string | null>(null);
  const focusOnCity = (latitude: number, longitude: number) => {
    const latitudeRadians = (latitude * Math.PI) / 180;
    setRotation(-longitude);
    setTilt(Math.max(-0.55, Math.min(0.55, -latitudeRadians)));
    setZoom((value) => Math.max(value, 1.08));
  };
  const resetView = () => {
    setRotation(0);
    setTilt(0);
    setZoom(1);
  };
  React.useImperativeHandle(ref, () => ({ focusOnCity, resetView }), []);
  React.useEffect(() => {
    if (!locationPicker || locationTarget === previousLocationTarget.current) return;
    previousLocationTarget.current = locationTarget;
    if (!locationTarget) {
      setRotation(0);
      setTilt(0);
      setZoom(1);
      return;
    }
    const [latitude, longitude] = locationTarget.split(',').map(Number);
    if (reduceMotion) {
      setRotation(-longitude);
      setTilt(Math.max(-0.55, Math.min(0.55, -(latitude * Math.PI) / 180)));
      setZoom(1.05);
      return;
    }
    const startRotation = currentRotation.current;
    const startTilt = currentTilt.current;
    const targetRotation = -longitude;
    const targetTilt = Math.max(-0.55, Math.min(0.55, -(latitude * Math.PI) / 180));
    const rotationDelta = ((targetRotation - startRotation + 540) % 360) - 180;
    const startedAt = Date.now();
    let frame = 0;
    const animate = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / 650);
      const eased = 1 - (1 - progress) ** 3;
      setRotation(startRotation + rotationDelta * eased);
      setTilt(startTilt + (targetTilt - startTilt) * eased);
      setZoom(1.05);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [locationPicker, locationTarget, reduceMotion]);
  React.useEffect(() => {
    if ((!locationPicker && !welcomeMode) || locationTarget || globeInteracting || (reduceMotion && !welcomeMode)) return;
    const timer = setInterval(() => setRotation((current) => current + 0.18), 40);
    return () => clearInterval(timer);
  }, [locationPicker, welcomeMode, locationTarget, globeInteracting, reduceMotion]);
  React.useEffect(() => {
    if (!locationPicker || !locationTarget || reduceMotion) {
      markerPulse.setValue(1);
      return;
    }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(markerPulse, { toValue: 1.35, duration: 900, useNativeDriver: true }),
      Animated.timing(markerPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [locationPicker, locationTarget, reduceMotion, markerPulse]);

  const friendCountsByCity = useMemo(() => {
    const counts = new Map<string, number>();
    friends.forEach((friend) => {
      const key = friend.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [friends]);
  const radius = (locationPicker ? 154 : fullScreen || welcomeMode ? FULLSCREEN_RADIUS : BASE_RADIUS) * zoom;
  const projectedWelcomeActivityCities = useMemo(
    () => welcomeMode
      ? welcomeActivityCities
        .map((activity) => ({
          activity,
          point: project(activity.latitude, activity.longitude, rotation, tilt, radius),
        }))
        .filter(({ point }) => point.z > 0.02)
        .sort((left, right) => right.activity.verifiedCompletions - left.activity.verifiedCompletions)
        .slice(0, 2)
      : [],
    [welcomeMode, welcomeActivityCities, rotation, tilt, radius],
  );
  const projectedCities = useMemo(
    () => cities
      .map((city) => ({ city, point: project(city.latitude, city.longitude, rotation, tilt, radius) }))
      .filter(({ point }) => point.z > 0.02),
    [cities, rotation, tilt, radius],
  );
  const projectedFriends = useMemo(() => {
    const cityCounts = new Map<string, number>();
    const cityIndices = new Map<string, number>();
    friends.forEach((friend) => {
      const cityKey = friend.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
      cityCounts.set(cityKey, (cityCounts.get(cityKey) ?? 0) + 1);
    });

    return friends
      .map((friend) => {
        const cityKey = friend.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
        const cityIndex = cityIndices.get(cityKey) ?? 0;
        cityIndices.set(cityKey, cityIndex + 1);
        const columns = Math.min(3, cityCounts.get(cityKey) ?? 1);
        return {
          friend,
          point: project(friend.latitude, friend.longitude, rotation, tilt, radius),
          offsetX: (cityIndex % columns - (columns - 1) / 2) * 14,
          offsetY: -Math.floor(cityIndex / columns) * 12,
          zIndex: cityIndex + 1,
        };
      })
      .filter(({ point }) => point.z > 0.02);
  }, [friends, rotation, tilt, radius]);
  const projectedExperienceLocations = useMemo(
    () => experienceLocations
      .map((location) => ({
        location,
        point: project(location.latitude, location.longitude, rotation, tilt, radius),
      }))
      .filter(({ point }) => point.z > 0.02),
    [experienceLocations, rotation, tilt, radius],
  );
  const selectedSearchPoint = selectedCity && selectedCityCoordinates && !selected
    ? project(selectedCityCoordinates.latitude, selectedCityCoordinates.longitude, rotation, tilt, radius)
    : null;
  const visibleSelectedSearchPoint = selectedSearchPoint && selectedSearchPoint.z > 0.02
    ? selectedSearchPoint
    : null;
  const globeScale = stageSize.width > 0 && stageSize.height > 0
    ? Math.min(stageSize.width / WIDTH, stageSize.height / HEIGHT)
    : 0;
  const globeOffsetX = (stageSize.width - WIDTH * globeScale) / 2;
  const globeOffsetY = (stageSize.height - HEIGHT * globeScale) / 2;
  const welcomeActivityStatusText = status === 'loading'
    ? 'Loading verified city activity…'
    : status === 'error'
      ? 'Verified city activity is temporarily unavailable.'
      : welcomeActivityCityCount === 0
        ? `No host-verified completions in the last ${welcomeActivityWindowDays} days yet.`
        : 'Verified activity is available, but no supported city location is mapped yet.';

  return (
    <View
      testID={welcomeMode ? 'welcome-globe' : locationPicker ? 'create-location-globe' : fullScreen ? 'explore-globe-map' : 'explore-globe-card'}
      style={welcomeMode
        ? styles.welcomeRoot
        : locationPicker
        ? styles.locationPickerShell
        : fullScreen
        ? [styles.fullScreenRoot, { backgroundColor: space.background }]
        : [styles.shell, { backgroundColor: space.background, borderColor: space.border }]}
    >
      {!fullScreen && !locationPicker && !welcomeMode ? (
        <>
          <View style={styles.headingRow}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.teal }]}>ACTIVITY, BY CITY</Text>
              <Text style={[styles.title, { color: space.foreground }]}>Find your people.</Text>
            </View>
            <View style={[styles.liveBadge, { borderColor: space.border, backgroundColor: space.surface }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.liveText, { color: space.muted }]}>CITY ACTIVITY</Text>
            </View>
          </View>
          <Text style={[styles.caption, { color: space.subdued }]}>A wider view of where communities are showing up. City positions are approximate.</Text>
        </>
      ) : null}

      <View
        testID="explore-globe-stage"
        style={welcomeMode
          ? styles.welcomeGlobeStage
          : locationPicker
            ? styles.locationPickerStage
            : fullScreen
              ? styles.fullScreenStage
              : styles.globeStage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStageSize((current) => current.width === width && current.height === height ? current : { width, height });
        }}
        {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
        onTouchStart={(event) => {
          if (locationPicker) setGlobeInteracting(true);
          const touch = event.nativeEvent.touches[0];
          if (!touch) return;
          const secondTouch = event.nativeEvent.touches[1];
          touchOrigin.current = {
            x: touch.pageX,
            y: touch.pageY,
            active: true,
            distance: secondTouch
              ? Math.hypot(secondTouch.pageX - touch.pageX, secondTouch.pageY - touch.pageY)
              : 0,
            zoom: currentZoom.current,
          };
          dragOrigin.current = { rotation: currentRotation.current, tilt: currentTilt.current };
        }}
        onTouchMove={(event) => {
          if (Platform.OS !== 'web') return;
          const touch = event.nativeEvent.touches[0];
          if (!touch || !touchOrigin.current.active) return;
          const secondTouch = event.nativeEvent.touches[1];
          if (secondTouch && touchOrigin.current.distance > 0) {
            const distance = Math.hypot(secondTouch.pageX - touch.pageX, secondTouch.pageY - touch.pageY);
            event.preventDefault();
            setZoom(Math.max(0.82, Math.min(1.2, touchOrigin.current.zoom * distance / touchOrigin.current.distance)));
            return;
          }
          const dx = touch.pageX - touchOrigin.current.x;
          const dy = touch.pageY - touchOrigin.current.y;
          if (Math.abs(dx) <= 5 && Math.abs(dy) <= 8) return;
          event.preventDefault();
          setRotation(dragOrigin.current.rotation + dx * 0.72);
          setTilt(Math.max(-0.55, Math.min(0.55, dragOrigin.current.tilt + dy / 360)));
        }}
        onTouchEnd={() => { touchOrigin.current.active = false; touchOrigin.current.distance = 0; setGlobeInteracting(false); }}
        onTouchCancel={() => { touchOrigin.current.active = false; touchOrigin.current.distance = 0; setGlobeInteracting(false); }}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <RadialGradient id="planet" cx="35%" cy="31%" rx="76%" ry="76%">
              <Stop offset="0" stopColor={isEarthGlobe ? EARTH_PALETTE.oceanLight : colors.muted} />
              <Stop offset="0.42" stopColor={isEarthGlobe ? EARTH_PALETTE.oceanMid : space.background} />
              <Stop offset="0.82" stopColor={isEarthGlobe ? EARTH_PALETTE.oceanDeep : space.background} />
              <Stop offset="1" stopColor={isEarthGlobe ? EARTH_PALETTE.oceanDeep : colors.violet} stopOpacity={isEarthGlobe ? 1 : 0.18} />
            </RadialGradient>
            <RadialGradient id="land" cx="40%" cy="30%" rx="80%" ry="82%">
              <Stop offset="0" stopColor={isEarthGlobe ? EARTH_PALETTE.landGreen : colors.accent} stopOpacity={isEarthGlobe ? 0.98 : 0.24} />
              <Stop offset="0.62" stopColor={isEarthGlobe ? EARTH_PALETTE.landWarm : colors.muted} stopOpacity="0.9" />
              <Stop offset="1" stopColor={isEarthGlobe ? EARTH_PALETTE.landHigh : space.background} stopOpacity={isEarthGlobe ? 0.9 : 0.96} />
            </RadialGradient>
            <ClipPath id="globeClip"><Circle cx={CENTER_X} cy={CENTER_Y} r={radius} /></ClipPath>
          </Defs>
          {!locationPicker ? STAR_FIELD.map(([x, y, size], index) => (
            <Circle
              key={`star-${index}`}
              cx={x}
              cy={y}
              r={welcomeMode ? size * 1.25 : size}
              fill={index % 4 === 0 ? colors.primary : colors.accent}
              fillOpacity={welcomeMode ? index % 3 === 0 ? 0.78 : 0.56 : index % 3 === 0 ? 0.45 : 0.25}
            />
          )) : null}
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius + 17} fill="none" stroke={isEarthGlobe ? EARTH_PALETTE.atmosphere : colors.violet} strokeOpacity={isEarthGlobe ? 0.12 : 0.13} strokeWidth="0.8" />
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius + 10} fill="none" stroke={isEarthGlobe ? EARTH_PALETTE.atmosphere : colors.primary} strokeOpacity={isEarthGlobe ? 0.23 : 0.22} strokeWidth="1.2" />
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius + 5} fill="none" stroke={isEarthGlobe ? EARTH_PALETTE.atmosphere : colors.teal} strokeOpacity={isEarthGlobe ? 0.14 : 0.18} strokeWidth="0.8" />
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="url(#planet)" stroke={isEarthGlobe ? EARTH_PALETTE.atmosphere : colors.primary} strokeOpacity={isEarthGlobe ? 0.58 : 0.68} strokeWidth="1.2" />
          <G clipPath="url(#globeClip)">
            {!locationPicker ? (
              <>
                <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius * 0.42} ry={radius} fill="none" stroke={colors.accent} strokeOpacity="0.2" strokeWidth="0.65" />
                <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius * 0.76} ry={radius} fill="none" stroke={colors.accent} strokeOpacity="0.16" strokeWidth="0.65" />
                <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius} ry={radius * 0.36} fill="none" stroke={colors.accent} strokeOpacity="0.18" strokeWidth="0.65" />
                <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius} ry={radius * 0.68} fill="none" stroke={colors.accent} strokeOpacity="0.14" strokeWidth="0.65" />
              </>
            ) : null}
            {LAND_POLYGONS.map((points, index) => {
              const path = polygonPath(points, rotation, tilt, radius);
              return path ? (
                <Path
                  key={`land-${index}`}
                  d={path}
                  fill="url(#land)"
                  fillOpacity={isEarthGlobe ? 0.96 : 0.86}
                  stroke={isEarthGlobe ? EARTH_PALETTE.coast : colors.accent}
                  strokeOpacity={isEarthGlobe ? 0.36 : 0.52}
                  strokeWidth={isEarthGlobe ? 0.48 : 0.95}
                  strokeLinejoin="round"
                />
              ) : null;
            })}
            {!locationPicker ? CITY_LIGHTS.map(([longitude, latitude, size], index) => {
              const point = project(latitude, longitude, rotation, tilt, radius);
              return point.z > 0.02 ? (
                <G key={`light-${index}`}>
                  <Circle cx={point.x} cy={point.y} r={size * 2.7} fill={colors.primary} fillOpacity="0.12" />
                  <Circle cx={point.x} cy={point.y} r={size} fill={space.foreground} fillOpacity="0.88" />
                </G>
              ) : null;
            }) : null}
            {welcomeMode ? projectedWelcomeActivityCities.map(({ activity, point }) => (
              <G key={`welcome-city-${activity.city}`}>
                <Circle cx={point.x} cy={point.y} r="13" fill={colors.primary} fillOpacity="0.16" />
                <Circle cx={point.x} cy={point.y} r="5.2" fill={colors.primary} stroke={welcomeColors.foreground} strokeOpacity="0.9" strokeWidth="1.3" />
                <Circle cx={point.x} cy={point.y} r="1.6" fill={welcomeColors.foreground} />
              </G>
            )) : null}
            {projectedCities.map(({ city, point }) => {
              const active = selectedCity === city.city;
              const cityKey = city.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
              const friendsNearby = friendCountsByCity.get(cityKey) ?? 0;
              const metric = mode === 'activity'
                ? city.participants
                : mode === 'impact'
                  ? city.xpOffered
                  : mode === 'social'
                    ? friendsNearby
                    : city.experiences;
              const dotRadius = Math.min(8, 3.8 + Math.log2(Math.max(metric, 1)) * 1.15);
              const markerColor = mode === 'activity'
                ? colors.teal
                : mode === 'impact'
                  ? colors.violet
                  : mode === 'social'
                    ? colors.teal
                    : colors.primary;
              const valueLabel = mode === 'activity'
                ? verifiedActivityStatus === 'ready'
                  ? `${city.participants} joined · ${city.recentVerifiedCompletions} verified (30d)`
                  : `${city.participants} joined`
                : mode === 'impact'
                  ? `${city.xpOffered.toLocaleString()} XP offered`
                  : mode === 'social'
                    ? `${friendsNearby} friends`
                    : `${city.experiences} experiences`;
              const showLabel = active || cities.length === 1 || (zoom > 1.05 && cities.length <= 3);
              return (
                <G key={city.city}>
                  <Circle cx={point.x} cy={point.y} r={dotRadius + 12} fill={markerColor} fillOpacity="0.02" />
                  <Circle cx={point.x} cy={point.y} r={dotRadius + 10} fill={markerColor} fillOpacity={active ? 0.2 : 0.08} />
                  {mode === 'activity' || mode === 'impact' ? (
                    <Circle cx={point.x} cy={point.y} r={dotRadius + (mode === 'activity' ? 7 : 5)} fill="none" stroke={markerColor} strokeOpacity={active ? 0.62 : 0.34} strokeWidth="1" />
                  ) : null}
                  <Circle cx={point.x} cy={point.y} r={dotRadius} fill={markerColor} stroke={space.foreground} strokeOpacity="0.88" strokeWidth="1.3" />
                  <Circle cx={point.x} cy={point.y} r={1.7} fill={space.foreground} />
                  {showLabel ? <SvgText x={point.x + 13} y={point.y - 9} fill={space.foreground} fontSize="10" fontWeight="600">{city.city} · {valueLabel}</SvgText> : null}
                </G>
              );
            })}
            {visibleSelectedSearchPoint ? (
              <G>
                <Circle cx={visibleSelectedSearchPoint.x} cy={visibleSelectedSearchPoint.y} r={locationPicker ? 12 : 9} fill="none" stroke={locationPicker ? colors.primary : colors.teal} strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="2 2" />
                <Circle cx={visibleSelectedSearchPoint.x} cy={visibleSelectedSearchPoint.y} r={locationPicker ? 4 : 3} fill={locationPicker ? colors.primary : colors.teal} />
                <SvgText x={visibleSelectedSearchPoint.x + 13} y={visibleSelectedSearchPoint.y - 9} fill={space.foreground} fontSize="10" fontWeight="600">{selectedCity}</SvgText>
              </G>
            ) : null}
          </G>
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="none" stroke={space.subdued} strokeOpacity="0.32" strokeWidth="0.8" />
          {!fullScreen && !locationPicker && !welcomeMode ? (
            <>
              <Line x1="18" y1="266" x2="58" y2="266" stroke={colors.primary} strokeOpacity="0.6" strokeWidth="1" />
              <SvgText x="65" y="269" fill={space.subdued} fontSize="8" letterSpacing="1.1">APPROX. CITY</SvgText>
            </>
          ) : null}
          {!welcomeMode ? (
            <SvgText testID="explore-globe-rotation" x="322" y="269" fill={space.subdued} fontSize="8" textAnchor="end">{Math.round(rotation % 360)}°</SvgText>
          ) : null}
        </Svg>
        <View style={[styles.markerLayer, { pointerEvents: 'box-none' }]}>
          {welcomeMode && globeScale > 0 ? projectedWelcomeActivityCities.map(({ activity, point }) => {
            const cardWidth = 142;
            const cardHeight = 54;
            const pointX = globeOffsetX + point.x * globeScale;
            const pointY = globeOffsetY + point.y * globeScale;
            const preferredLeft = point.x <= CENTER_X ? pointX + 10 : pointX - cardWidth - 10;
            const left = Math.max(6, Math.min(stageSize.width - cardWidth - 6, preferredLeft));
            const top = Math.max(6, Math.min(stageSize.height - cardHeight - 6, pointY - cardHeight - 8));
            return (
              <View
                key={`welcome-activity-${activity.city}`}
                testID={`welcome-activity-${activity.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                accessible
                accessibilityLabel={`${activity.city}: ${activity.verifiedCompletions} host-verified completions in the last ${welcomeActivityWindowDays} days.`}
                style={[
                  styles.welcomeActivityPopover,
                  {
                    pointerEvents: 'none',
                    left,
                    top,
                    width: cardWidth,
                    minHeight: cardHeight,
                    borderColor: `${welcomeColors.foreground}38`,
                    shadowColor: welcomeColors.background,
                  },
                ]}
              >
                <View style={[StyleSheet.absoluteFill, styles.welcomeActivityGlassClip]}>
                  {hasWelcomeGlass ? (
                    <GlassView
                      glassEffectStyle="regular"
                      tintColor={`${colors.primary}24`}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: `${welcomeColors.surface}E8` }]} />
                  )}
                </View>
                <View style={[styles.welcomeActivityIcon, { backgroundColor: `${colors.primary}28` }]}>
                  <Feather name="users" size={15} color={colors.primary} />
                </View>
                <View style={styles.welcomeActivityCopy}>
                  <Text numberOfLines={1} style={[styles.welcomeActivityCity, { color: welcomeColors.foreground }]}>
                    {activity.city}
                  </Text>
                  <Text numberOfLines={1} style={[styles.welcomeActivityMetric, { color: welcomeColors.muted }]}>
                    {activity.verifiedCompletions} verified · {welcomeActivityWindowDays}d
                  </Text>
                </View>
              </View>
            );
          }) : null}
          {welcomeMode && welcomeActivityCities.length === 0 ? (
            <View
              accessible
              accessibilityLabel={welcomeActivityStatusText}
              style={[
                styles.welcomeActivityStatus,
                {
                  pointerEvents: 'none',
                  backgroundColor: `${welcomeColors.surface}E8`,
                  borderColor: `${welcomeColors.foreground}30`,
                },
              ]}
            >
              <Feather
                name={status === 'error' ? 'alert-circle' : 'activity'}
                size={14}
                color={status === 'error' ? colors.primary : colors.teal}
              />
              <Text numberOfLines={2} style={[styles.welcomeActivityStatusText, { color: welcomeColors.muted }]}>
                {welcomeActivityStatusText}
              </Text>
            </View>
          ) : null}
          {locationPicker && visibleSelectedSearchPoint && globeScale > 0 && !reduceMotion ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 18,
                height: 18,
                borderWidth: 1.5,
                borderColor: colors.primary,
                borderRadius: 9,
                left: globeOffsetX + visibleSelectedSearchPoint.x * globeScale - 9,
                top: globeOffsetY + visibleSelectedSearchPoint.y * globeScale - 9,
                opacity: markerPulse.interpolate({ inputRange: [1, 1.35], outputRange: [0.52, 0.08] }),
                transform: [{ scale: markerPulse }],
              }}
            />
          ) : null}
          {globeScale > 0 ? projectedCities.map(({ city, point }) => {
            const cityKey = city.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
            const friendsNearby = friendCountsByCity.get(cityKey) ?? 0;
            const markerSummary = mode === 'activity'
              ? verifiedActivityStatus === 'ready'
                ? `${city.participants} participants signed up; ${city.recentVerifiedCompletions} host-verified completions in the last 30 days`
                : `${city.participants} participants signed up`
              : mode === 'impact'
                ? `${city.xpOffered.toLocaleString()} XP offered`
                : mode === 'social'
                  ? `${friendsNearby} friends`
                  : `${city.experiences} experiences`;
            return (
              <Pressable
                key={city.city}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`${city.city}: ${markerSummary}`}
                accessibilityHint="Focuses the globe on this approximate city and shows its experience activity."
                testID={`explore-globe-marker-${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                onPress={() => {
                  focusOnCity(city.latitude, city.longitude);
                  onSelectCity(city.city);
                }}
                style={[
                  styles.markerHitTarget,
                  {
                    left: globeOffsetX + point.x * globeScale - 22,
                    top: globeOffsetY + point.y * globeScale - 22,
                  },
                ]}
              />
            );
          }) : null}
          {fullScreen && mode === 'explore' && globeScale > 0 ? projectedExperienceLocations.map(({ location, point }) => (
            <Pressable
              key={location.experienceId}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Open ${location.title}. Verified ${location.precision.replace('_', ' ')} location in ${location.city}.`}
              accessibilityHint="Opens experience details. The map position is rounded to the disclosed location precision."
              testID={`explore-verified-location-${location.experienceId}`}
              onPress={() => onSelectExperience?.(location.experienceId)}
              style={[
                styles.experienceLocationHitTarget,
                {
                  left: globeOffsetX + point.x * globeScale - 13,
                  top: globeOffsetY + point.y * globeScale - 13,
                },
              ]}
            >
              <View style={[styles.experienceLocationMarker, { backgroundColor: colors.primary, borderColor: space.background }]}>
                <Feather name="check" size={9} color={colors.primaryForeground} />
              </View>
            </Pressable>
          )) : null}
          {fullScreen && (showFriends || mode === 'social') && globeScale > 0 ? projectedFriends.map(({ friend, point, offsetX, offsetY, zIndex }) => (
            <Pressable
              key={friend.id}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Open ${friend.name}'s profile in ${friend.city}`}
              accessibilityHint="Shows this friend's approximate profile city and opens their profile."
              testID={`explore-friend-pin-${friend.id}`}
              onPress={() => onSelectFriend?.(friend.id)}
              style={[
                styles.friendPin,
                {
                  left: globeOffsetX + point.x * globeScale + offsetX - 24,
                  top: globeOffsetY + point.y * globeScale + offsetY - 52,
                  zIndex,
                  elevation: zIndex,
                },
              ]}
            >
              <View style={[styles.friendPinTail, { backgroundColor: colors.primary }]} />
              <View style={[styles.friendPinHead, { backgroundColor: colors.primary, borderColor: space.background }]}>
                <UserAvatar
                  avatarUrl={friend.avatarUrl}
                  name={friend.name}
                  containerStyle={[styles.friendPinAvatar, { backgroundColor: space.background }]}
                  initialStyle={{ color: colors.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 }}
                />
              </View>
            </Pressable>
          )) : null}
        </View>
        <View style={[
          styles.atmosphere,
          locationPicker && styles.locationPickerAtmosphere,
          { pointerEvents: 'none', backgroundColor: colors.violet },
        ]} />
        {!locationPicker && !welcomeMode && !sheetExpanded ? <View style={[
          styles.zoomControls,
          fullScreen && styles.fullScreenZoomControls,
          !fullScreen && { top: 18 },
          fullScreen && { bottom: Math.max(16, sheetOverlayHeight + 16) },
          { backgroundColor: space.surface, borderColor: space.border },
        ]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in on globe" testID="explore-globe-zoom-in" onPress={() => setZoom((value) => Math.min(1.2, value + 0.1))} style={[styles.zoomButton, fullScreen && styles.fullScreenZoomButton]}>
            <Feather name="plus" size={16} color={space.foreground} />
          </Pressable>
          <View style={[styles.zoomDivider, fullScreen && styles.fullScreenZoomDivider, { backgroundColor: space.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out on globe" testID="explore-globe-zoom-out" onPress={() => setZoom((value) => Math.max(0.82, value - 0.1))} style={[styles.zoomButton, fullScreen && styles.fullScreenZoomButton]}>
            <Feather name="minus" size={16} color={space.foreground} />
          </Pressable>
          <View style={[styles.zoomDivider, fullScreen && styles.fullScreenZoomDivider, { backgroundColor: space.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Reset globe view" testID="explore-globe-reset" onPress={() => { resetView(); onResetCity(); }} style={[styles.zoomButton, fullScreen && styles.fullScreenZoomButton]}>
            <Feather name="rotate-ccw" size={14} color={space.muted} />
          </Pressable>
        </View> : null}
      </View>
      {welcomeMode ? null : locationPicker ? (
        <View style={styles.locationPickerCaption}>
          <Feather name={selectedCity ? 'map-pin' : 'move'} size={13} color={selectedCity ? colors.primary : space.muted} />
          <Text style={{ color: space.muted, fontSize: 11, fontFamily: 'Inter_500Medium' }}>
            {selectedCity ? `Focused on ${selectedCity}` : 'Drag the globe to explore'}
          </Text>
        </View>
      ) : !fullScreen ? (
        <>
          <View style={styles.globeFooter}>
            <View style={styles.legend}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendCopy, { color: space.subdued }]}>Experiences happening</Text></View>
            <Text style={[styles.dragHint, { color: space.subdued }]}>DRAG TO ROTATE</Text>
          </View>
          {selected ? (
        <View style={[styles.preview, { backgroundColor: space.surface, borderColor: space.border }]}>
          <View style={styles.previewCopy}>
            <Text style={[styles.previewEyebrow, { color: colors.teal }]}>CITY OVERVIEW</Text>
            <Text style={[styles.previewTitle, { color: space.foreground }]}>{selected.city}</Text>
            <Text style={[styles.previewMeta, { color: space.muted }]}>{selected.experiences} {selected.experiences === 1 ? 'experience' : 'experiences'} · {selected.participants} sign-ups · {selected.places} places open</Text>
            <Text style={[styles.previewMeta, { color: space.muted, marginTop: 3 }]}>
              {verifiedActivityStatus === 'ready'
                ? `${selected.recentVerifiedCompletions} host-verified completions in the last 30 days`
                : verifiedActivityStatus === 'error'
                  ? 'Recent verified activity could not load'
                  : 'Loading recent verified activity…'}
            </Text>
            <Text style={[styles.previewXp, { color: space.subdued }]}>{selected.xpOffered.toLocaleString()} XP offered across these experiences</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Explore experiences in ${selected.city}`} testID="explore-globe-city-action" onPress={() => onExploreCity(selected.city)} style={[styles.exploreButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.exploreButtonText, { color: colors.primaryForeground }]}>Explore</Text>
            <Feather name="arrow-right" size={15} color={colors.primaryForeground} />
          </Pressable>
        </View>
          ) : (
        <View style={[styles.note, { borderTopColor: space.border }]}>
          <Feather name="info" size={13} color={colors.teal} />
          <Text style={[styles.noteText, { color: space.subdued }]}>
            {status === 'loading'
              ? 'Loading city activity…'
              : status === 'error'
                ? 'City activity could not load. See the experience list below.'
                : cities.length
                  ? 'City-level activity only. Tap a marker for the local picture.'
                  : 'No mapped cities in this result. All matches remain below.'}
          </Text>
        </View>
          )}
        </>
      ) : null}
    </View>
  );
});

// Keep a stable renderer contract while the lightweight SVG engine remains the supported fallback.
const SVG_GLOBE_ENGINE: GlobeEngine = SvgGlobeEngine;

export const ExploreGlobe = React.forwardRef<ExploreGlobeHandle, Props>(function ExploreGlobe(props, ref) {
  const Engine = SVG_GLOBE_ENGINE;
  return <Engine {...props} ref={ref} />;
});

const styles = StyleSheet.create({
  welcomeRoot: { flex: 1, height: '100%', width: '100%', position: 'relative', overflow: 'visible', pointerEvents: 'none' },
  welcomeGlobeStage: { flex: 1, height: '100%', width: '100%', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  welcomeActivityPopover: {
    position: 'absolute',
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 17,
    overflow: 'hidden',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  welcomeActivityGlassClip: { borderRadius: 17, overflow: 'hidden' },
  welcomeActivityIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  welcomeActivityCopy: { flex: 1, minWidth: 0, gap: 2 },
  welcomeActivityCity: { fontSize: 11, lineHeight: 14, fontFamily: 'Inter_700Bold' },
  welcomeActivityMetric: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_500Medium' },
  welcomeActivityStatus: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 5,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  welcomeActivityStatusText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  locationPickerShell: { width: '100%', borderWidth: 0, borderRadius: 0, overflow: 'visible', padding: 0, marginTop: -8, marginBottom: 0 },
  locationPickerStage: { width: '100%', height: 326, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  locationPickerAtmosphere: { width: '100%', height: 84, bottom: 32, opacity: 0.08 },
  locationPickerCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 0, minHeight: 20 },
  fullScreenRoot: { flex: 1, position: 'relative' },
  fullScreenStage: { flex: 1, position: 'relative', alignItems: 'center', justifyContent: 'center', transform: [{ translateY: 70 }] },
  shell: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 17, paddingTop: 18, paddingBottom: 14, marginBottom: 25, overflow: 'hidden' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.7, marginBottom: 5 },
  title: { fontSize: 20, lineHeight: 25, letterSpacing: -0.4, fontFamily: 'Inter_700Bold' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveText: { fontSize: 8, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  caption: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 5 },
  globeStage: { height: 244, marginTop: 1, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  markerLayer: { ...StyleSheet.absoluteFill },
  markerHitTarget: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'transparent' },
  experienceLocationHitTarget: { position: 'absolute', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  experienceLocationMarker: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  friendPin: { position: 'absolute', width: 48, height: 54, alignItems: 'center' },
  friendPinTail: { position: 'absolute', width: 14, height: 14, top: 35, transform: [{ rotate: '45deg' }] },
  friendPinHead: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, padding: 2, alignItems: 'center', justifyContent: 'center' },
  friendPinAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  atmosphere: { position: 'absolute', width: 248, height: 62, borderRadius: 100, opacity: 0.09, bottom: 18, transform: [{ scaleX: 1.2 }] },
  zoomControls: { position: 'absolute', right: 0, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  fullScreenZoomControls: { right: 14, bottom: 16, flexDirection: 'row', alignItems: 'center', zIndex: 3 },
  zoomButton: { width: 36, height: 35, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 7 },
  fullScreenZoomButton: { width: 42, height: 44 },
  fullScreenZoomDivider: { width: 1, height: 18, marginHorizontal: 0 },
  globeFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginTop: -4, marginBottom: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { height: 6, width: 6, borderRadius: 4 },
  legendCopy: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  dragHint: { fontSize: 8, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  preview: { borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewCopy: { flex: 1, minWidth: 0 },
  previewEyebrow: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 3 },
  previewTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  previewMeta: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  previewXp: { fontSize: 9, marginTop: 4, fontFamily: 'Inter_400Regular' },
  exploreButton: { height: 38, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  exploreButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11 },
  noteText: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
});