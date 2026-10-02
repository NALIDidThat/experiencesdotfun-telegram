import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type GlobeCity = {
  city: string;
  latitude: number;
  longitude: number;
  experiences: number;
  participants: number;
  places: number;
  xpOffered: number;
};

type Props = {
  cities: GlobeCity[];
  selectedCity: string | null;
  status: 'loading' | 'ready' | 'error';
  onSelectCity: (city: string) => void;
  onExploreCity: (city: string) => void;
  onResetCity: () => void;
};

const WIDTH = 340;
const HEIGHT = 300;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 151;
const BASE_RADIUS = 119;
const LAND_SHAPES: Array<Array<[number, number]>> = [
  [[-165, 70], [-140, 62], [-125, 50], [-112, 30], [-97, 20], [-82, 8], [-78, -8], [-95, -15], [-105, -4], [-117, 12], [-130, 28], [-150, 45]],
  [[-81, 12], [-68, 8], [-53, -5], [-48, -22], [-58, -39], [-69, -54], [-76, -34]],
  [[-10, 72], [18, 70], [40, 58], [54, 42], [42, 34], [32, 20], [22, 8], [10, -3], [-2, 7], [-15, 24], [-9, 38], [-24, 53]],
  [[35, 68], [68, 64], [98, 56], [125, 48], [150, 58], [170, 48], [150, 32], [132, 18], [118, 6], [106, -4], [95, 8], [78, 18], [61, 28], [48, 43]],
  [[112, -10], [134, -12], [153, -23], [145, -39], [130, -44], [116, -30]],
  [[-48, 82], [-20, 76], [5, 79], [25, 71], [15, 61], [-4, 58], [-28, 63]],
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

export function ExploreGlobe({ cities, selectedCity, status, onSelectCity, onExploreCity, onResetCity }: Props) {
  const colors = useColors();
  const space = colors.welcome;
  const [rotation, setRotation] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const dragOrigin = useRef({ rotation: 0, tilt: 0 });
  const touchOrigin = useRef({ x: 0, y: 0, active: false });
  const currentRotation = useRef(rotation);
  const currentTilt = useRef(tilt);
  currentRotation.current = rotation;
  currentTilt.current = tilt;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 8,
    onPanResponderGrant: () => { dragOrigin.current = { rotation: currentRotation.current, tilt: currentTilt.current }; },
    onPanResponderMove: (_event, gesture) => {
      setRotation(dragOrigin.current.rotation + gesture.dx * 0.72);
      setTilt(Math.max(-0.55, Math.min(0.55, dragOrigin.current.tilt + gesture.dy / 360)));
    },
  }), []);
  const selected = cities.find((item) => item.city === selectedCity) ?? null;
  const radius = BASE_RADIUS * zoom;
  const projectedCities = useMemo(
    () => cities
      .map((city) => ({ city, point: project(city.latitude, city.longitude, rotation, tilt, radius) }))
      .filter(({ point }) => point.z > 0.02),
    [cities, rotation, tilt, radius],
  );
  const globeScale = stageSize.width > 0 && stageSize.height > 0
    ? Math.min(stageSize.width / WIDTH, stageSize.height / HEIGHT)
    : 0;
  const globeOffsetX = (stageSize.width - WIDTH * globeScale) / 2;
  const globeOffsetY = (stageSize.height - HEIGHT * globeScale) / 2;

  return (
    <View style={[styles.shell, { backgroundColor: space.background, borderColor: space.border }]}>
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.teal }]}>ACTIVITY, BY CITY</Text>
          <Text style={[styles.title, { color: space.foreground }]}>Find your people.</Text>
        </View>
        <View style={[styles.liveBadge, { borderColor: space.border, backgroundColor: space.surface }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.teal }]} />
          <Text style={[styles.liveText, { color: space.muted }]}>CITY ACTIVITY</Text>
        </View>
      </View>
      <Text style={[styles.caption, { color: space.subdued }]}>A wider view of where communities are showing up. City positions are approximate.</Text>

      <View
        style={styles.globeStage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStageSize((current) => current.width === width && current.height === height ? current : { width, height });
        }}
        {...(Platform.OS === 'web' ? {} : panResponder.panHandlers)}
        onTouchStart={Platform.OS === 'web' ? (event) => {
          const touch = event.nativeEvent.touches[0];
          if (!touch) return;
          touchOrigin.current = { x: touch.pageX, y: touch.pageY, active: true };
          dragOrigin.current = { rotation: currentRotation.current, tilt: currentTilt.current };
        } : undefined}
        onTouchMove={Platform.OS === 'web' ? (event) => {
          const touch = event.nativeEvent.touches[0];
          if (!touch || !touchOrigin.current.active) return;
          const dx = touch.pageX - touchOrigin.current.x;
          const dy = touch.pageY - touchOrigin.current.y;
          if (Math.abs(dx) <= 5 && Math.abs(dy) <= 8) return;
          event.preventDefault();
          setRotation(dragOrigin.current.rotation + dx * 0.72);
          setTilt(Math.max(-0.55, Math.min(0.55, dragOrigin.current.tilt + dy / 360)));
        } : undefined}
        onTouchEnd={Platform.OS === 'web' ? () => { touchOrigin.current.active = false; } : undefined}
        onTouchCancel={Platform.OS === 'web' ? () => { touchOrigin.current.active = false; } : undefined}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Defs>
            <RadialGradient id="planet" cx="34%" cy="28%" rx="72%" ry="72%">
              <Stop offset="0" stopColor={space.surface} />
              <Stop offset="0.72" stopColor={space.background} />
              <Stop offset="1" stopColor={space.background} />
            </RadialGradient>
            <ClipPath id="globeClip"><Circle cx={CENTER_X} cy={CENTER_Y} r={radius} /></ClipPath>
          </Defs>
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius + 10} fill="none" stroke={colors.violet} strokeOpacity="0.13" strokeWidth="1" />
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius + 4} fill="none" stroke={colors.teal} strokeOpacity="0.10" strokeWidth="1" />
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="url(#planet)" stroke={space.subdued} strokeOpacity="0.65" strokeWidth="1" />
          <G clipPath="url(#globeClip)">
            <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius * 0.42} ry={radius} fill="none" stroke={space.muted} strokeOpacity="0.14" strokeWidth="0.7" />
            <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius * 0.76} ry={radius} fill="none" stroke={space.muted} strokeOpacity="0.10" strokeWidth="0.7" />
            <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius} ry={radius * 0.36} fill="none" stroke={space.muted} strokeOpacity="0.12" strokeWidth="0.7" />
            <Ellipse cx={CENTER_X} cy={CENTER_Y} rx={radius} ry={radius * 0.68} fill="none" stroke={space.muted} strokeOpacity="0.09" strokeWidth="0.7" />
            {LAND_SHAPES.map((points, index) => (
              <Path key={index} d={polygonPath(points, rotation, tilt, radius)} fill="none" stroke={space.subdued} strokeOpacity="0.48" strokeWidth="1.2" strokeLinejoin="round" />
            ))}
            {projectedCities.map(({ city, point }) => {
              const active = selectedCity === city.city;
              const dotRadius = Math.min(8, 4.2 + Math.log2(city.experiences) * 1.2);
              const showLabel = active || cities.length === 1 || (zoom > 1.05 && cities.length <= 3);
              return (
                <G key={city.city}>
                  <Circle cx={point.x} cy={point.y} r={dotRadius + 12} fill={colors.primary} fillOpacity="0.02" />
                  <Circle cx={point.x} cy={point.y} r={dotRadius + 10} fill={colors.primary} fillOpacity={active ? 0.2 : 0.08} />
                  <Circle cx={point.x} cy={point.y} r={dotRadius} fill={active ? colors.primary : colors.teal} stroke={space.foreground} strokeOpacity="0.88" strokeWidth="1.3" />
                  <Circle cx={point.x} cy={point.y} r={1.7} fill={space.foreground} />
                  {showLabel ? <SvgText x={point.x + 13} y={point.y - 9} fill={space.foreground} fontSize="10" fontWeight="600">{city.city} · {city.experiences}</SvgText> : null}
                </G>
              );
            })}
          </G>
          <Circle cx={CENTER_X} cy={CENTER_Y} r={radius} fill="none" stroke={space.subdued} strokeOpacity="0.32" strokeWidth="0.8" />
          <Line x1="18" y1="266" x2="58" y2="266" stroke={colors.teal} strokeOpacity="0.6" strokeWidth="1" />
          <SvgText x="65" y="269" fill={space.subdued} fontSize="8" letterSpacing="1.1">APPROX. CITY</SvgText>
          <SvgText x="322" y="269" fill={space.subdued} fontSize="8" textAnchor="end">{Math.round(rotation % 360)}°</SvgText>
        </Svg>
        <View style={[styles.markerLayer, { pointerEvents: 'box-none' }]}>
          {globeScale > 0 ? projectedCities.map(({ city, point }) => (
            <Pressable
              key={city.city}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${city.city}: ${city.experiences} experiences`}
              accessibilityHint="Shows experience activity for this city"
              testID={`explore-globe-marker-${city.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              onPress={() => onSelectCity(city.city)}
              style={[
                styles.markerHitTarget,
                {
                  left: globeOffsetX + point.x * globeScale - 22,
                  top: globeOffsetY + point.y * globeScale - 22,
                },
              ]}
            />
          )) : null}
        </View>
        <View style={[styles.atmosphere, { pointerEvents: 'none', backgroundColor: colors.violet }]} />
        <View style={[styles.zoomControls, { backgroundColor: space.surface, borderColor: space.border }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in on globe" testID="explore-globe-zoom-in" onPress={() => setZoom((value) => Math.min(1.2, value + 0.1))} style={styles.zoomButton}>
            <Feather name="plus" size={16} color={space.foreground} />
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: space.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out on globe" testID="explore-globe-zoom-out" onPress={() => setZoom((value) => Math.max(0.82, value - 0.1))} style={styles.zoomButton}>
            <Feather name="minus" size={16} color={space.foreground} />
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: space.border }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Reset globe view" testID="explore-globe-reset" onPress={() => { setRotation(0); setTilt(0); setZoom(1); onResetCity(); }} style={styles.zoomButton}>
            <Feather name="rotate-ccw" size={14} color={space.muted} />
          </Pressable>
        </View>
      </View>
      <View style={styles.globeFooter}>
        <View style={styles.legend}><View style={[styles.legendDot, { backgroundColor: colors.teal }]} /><Text style={[styles.legendCopy, { color: space.subdued }]}>Experiences happening</Text></View>
        <Text style={[styles.dragHint, { color: space.subdued }]}>DRAG TO ROTATE</Text>
      </View>
      {selected ? (
        <View style={[styles.preview, { backgroundColor: space.surface, borderColor: space.border }]}>
          <View style={styles.previewCopy}>
            <Text style={[styles.previewEyebrow, { color: colors.teal }]}>CITY OVERVIEW</Text>
            <Text style={[styles.previewTitle, { color: space.foreground }]}>{selected.city}</Text>
            <Text style={[styles.previewMeta, { color: space.muted }]}>{selected.experiences} {selected.experiences === 1 ? 'experience' : 'experiences'} · {selected.participants} sign-ups · {selected.places} places open</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  atmosphere: { position: 'absolute', width: 206, height: 34, borderRadius: 100, opacity: 0.08, bottom: 20, transform: [{ scaleX: 1.15 }] },
  zoomControls: { position: 'absolute', right: 0, top: 18, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  zoomButton: { width: 36, height: 35, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 7 },
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