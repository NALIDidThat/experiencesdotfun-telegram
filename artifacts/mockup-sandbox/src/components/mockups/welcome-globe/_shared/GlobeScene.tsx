import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Users } from 'lucide-react';
import landData from '@/assets/ne_110m_land.json';

type ActivityCity = {
  city: string;
  latitude: number;
  longitude: number;
  verifiedCompletions: number;
};

type LandGeometry =
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };

type ProjectedPoint = { x: number; y: number; z: number };
type ProjectedActivity = { activity: ActivityCity; point: ProjectedPoint };
type Callout = ProjectedActivity & { left: number; top: number; width: number; height: number };

const WIDTH = 340;
const HEIGHT = 300;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 151;
const RADIUS = 140;
const EARTH = {
  oceanLight: '#438fa9',
  oceanMid: '#126182',
  oceanDeep: '#071f3d',
  landGreen: '#7b9c62',
  landWarm: '#b6a477',
  landHigh: '#ded4b5',
  coast: '#d8e8d0',
  atmosphere: '#8ed4ef',
};

// The same Natural Earth geometry, star field, city lights and sample activity
// make the baseline a faithful view of the app's Welcome-mode globe.
const LAND_POLYGONS: Array<Array<[number, number]>> = (
  landData as unknown as { features: Array<{ geometry: LandGeometry }> }
).features.flatMap(({ geometry }) => (
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
));

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

const ACTIVITY_CITIES: ActivityCity[] = [
  { city: 'London', latitude: 51.5, longitude: -0.1, verifiedCompletions: 24 },
  { city: 'Nairobi', latitude: -1.3, longitude: 36.8, verifiedCompletions: 9 },
];

function project(latitude: number, longitude: number, rotation: number): ProjectedPoint {
  const lat = (latitude * Math.PI) / 180;
  const lon = ((longitude + rotation) * Math.PI) / 180;
  const x = Math.cos(lat) * Math.sin(lon);
  const y = -Math.sin(lat);
  const z = Math.cos(lat) * Math.cos(lon);
  return { x: CENTER_X + x * RADIUS, y: CENTER_Y + y * RADIUS, z };
}

function polygonPath(points: Array<[number, number]>, rotation: number) {
  let path = '';
  let drawing = false;
  points.forEach(([longitude, latitude]) => {
    const point = project(latitude, longitude, rotation);
    if (point.z > 0.04) {
      path += `${drawing ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
      drawing = true;
    } else {
      drawing = false;
    }
  });
  return path;
}

function bounded(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCallouts(
  projected: ProjectedActivity[],
  width: number,
  height: number,
  scale: number,
  clearer: boolean,
): Callout[] {
  const cardWidth = clearer ? 166 : 142;
  const cardHeight = 54;
  const calloutGap = clearer ? 24 : 10;
  const placed: Callout[] = [];

  projected.forEach(({ activity, point }, index) => {
    const pointX = (width - WIDTH * scale) / 2 + point.x * scale;
    const pointY = (height - HEIGHT * scale) / 2 + point.y * scale;
    const preferredLeft = point.x <= CENTER_X
      ? pointX + calloutGap
      : pointX - cardWidth - calloutGap;
    let left = bounded(preferredLeft, 6, width - cardWidth - 6);
    const minimumTop = clearer ? 48 : 6;
    let top = bounded(pointY - cardHeight - 8, minimumTop, height - cardHeight - 6);

    if (clearer && index > 0) {
      const overlaps = (candidateLeft: number, candidateTop: number) => placed.some((item) => (
        candidateLeft < item.left + item.width + 8
        && candidateLeft + cardWidth + 8 > item.left
        && candidateTop < item.top + item.height + 8
        && candidateTop + cardHeight + 8 > item.top
      ));
      if (overlaps(left, top)) {
        const alternateLeft = bounded(
          pointX < width / 2 ? pointX - cardWidth - calloutGap : pointX + calloutGap,
          6,
          width - cardWidth - 6,
        );
        const alternateTop = bounded(pointY + 14, minimumTop, height - cardHeight - 6);
        if (!overlaps(alternateLeft, alternateTop)) {
          left = alternateLeft;
          top = alternateTop;
        } else {
          top = alternateTop;
        }
      }
    }

    placed.push({ activity, point, left, top, width: cardWidth, height: cardHeight });
  });

  return placed;
}

export function GlobeScene({ clearer = false }: { clearer?: boolean }) {
  const [rotation, setRotation] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 402, height: 430 });
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setRotation((value) => value + 0.18), 40);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateSize = () => {
      const { width, height } = stage.getBoundingClientRect();
      setStageSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(stageSize.width / WIDTH, stageSize.height / HEIGHT);
  const projected = useMemo(
    () => ACTIVITY_CITIES
      .map((activity) => ({ activity, point: project(activity.latitude, activity.longitude, rotation) }))
      .filter(({ point }) => point.z > 0.02)
      .sort((left, right) => right.activity.verifiedCompletions - left.activity.verifiedCompletions)
      .slice(0, 2),
    [rotation],
  );
  const callouts = getCallouts(projected, stageSize.width, stageSize.height, scale, clearer);

  return (
    <main className={`welcome-globe-frame ${clearer ? 'is-clearer' : 'is-current'}`}>
      {clearer ? (
        <div className="wg-activity-key" aria-label="Host-verified completions in the last 30 days">
          <span className="wg-key-dot"><BadgeCheck size={13} aria-hidden="true" /></span>
          <span>Host-verified completions</span>
          <span className="wg-key-period">Last 30 days</span>
        </div>
      ) : null}

      <div className="wg-stage" ref={stageRef} aria-label="Continuously rotating Earth globe with verified community activity">
        <svg className="wg-globe-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Rotating globe showing community activity">
          <defs>
            <radialGradient id="planet" cx="35%" cy="31%" rx="76%" ry="76%">
              <stop offset="0" stopColor={EARTH.oceanLight} />
              <stop offset="0.42" stopColor={EARTH.oceanMid} />
              <stop offset="0.82" stopColor={EARTH.oceanDeep} />
              <stop offset="1" stopColor={EARTH.oceanDeep} />
            </radialGradient>
            <radialGradient id="land" cx="40%" cy="30%" rx="80%" ry="82%">
              <stop offset="0" stopColor={EARTH.landGreen} stopOpacity="0.98" />
              <stop offset="0.62" stopColor={EARTH.landWarm} stopOpacity="0.9" />
              <stop offset="1" stopColor={EARTH.landHigh} stopOpacity="0.9" />
            </radialGradient>
            <clipPath id="globeClip">
              <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} />
            </clipPath>
          </defs>
          {STAR_FIELD.map(([x, y, size], index) => (
            <circle
              key={`star-${index}`}
              cx={x}
              cy={y}
              r={size * 1.25}
              fill={index % 4 === 0 ? 'var(--welcome-pink)' : 'var(--welcome-teal)'}
              fillOpacity={index % 3 === 0 ? 0.78 : 0.56}
            />
          ))}
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS + 17} fill="none" stroke={EARTH.atmosphere} strokeOpacity="0.12" strokeWidth="0.8" />
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS + 10} fill="none" stroke={EARTH.atmosphere} strokeOpacity="0.23" strokeWidth="1.2" />
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS + 5} fill="none" stroke={EARTH.atmosphere} strokeOpacity="0.14" strokeWidth="0.8" />
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fill="url(#planet)" stroke={EARTH.atmosphere} strokeOpacity="0.58" strokeWidth="1.2" />
          <g clipPath="url(#globeClip)">
            <ellipse cx={CENTER_X} cy={CENTER_Y} rx={RADIUS * 0.42} ry={RADIUS} fill="none" stroke="var(--welcome-teal)" strokeOpacity="0.2" strokeWidth="0.65" />
            <ellipse cx={CENTER_X} cy={CENTER_Y} rx={RADIUS * 0.76} ry={RADIUS} fill="none" stroke="var(--welcome-teal)" strokeOpacity="0.16" strokeWidth="0.65" />
            <ellipse cx={CENTER_X} cy={CENTER_Y} rx={RADIUS} ry={RADIUS * 0.36} fill="none" stroke="var(--welcome-teal)" strokeOpacity="0.18" strokeWidth="0.65" />
            <ellipse cx={CENTER_X} cy={CENTER_Y} rx={RADIUS} ry={RADIUS * 0.68} fill="none" stroke="var(--welcome-teal)" strokeOpacity="0.14" strokeWidth="0.65" />
            {LAND_POLYGONS.map((points, index) => {
              const path = polygonPath(points, rotation);
              return path ? (
                <path
                  key={`land-${index}`}
                  d={path}
                  fill="url(#land)"
                  fillOpacity="0.96"
                  stroke={EARTH.coast}
                  strokeOpacity="0.36"
                  strokeWidth="0.48"
                  strokeLinejoin="round"
                />
              ) : null;
            })}
            {CITY_LIGHTS.map(([longitude, latitude, size], index) => {
              const point = project(latitude, longitude, rotation);
              return point.z > 0.02 ? (
                <g key={`light-${index}`}>
                  <circle cx={point.x} cy={point.y} r={size * 2.7} fill="var(--welcome-pink)" fillOpacity="0.12" />
                  <circle cx={point.x} cy={point.y} r={size} fill="var(--welcome-fg)" fillOpacity="0.88" />
                </g>
              ) : null;
            })}
            {projected.map(({ activity, point }) => (
              <g key={`activity-${activity.city}`}>
                <circle cx={point.x} cy={point.y} r="13" fill="var(--welcome-pink)" fillOpacity={clearer ? '0.22' : '0.16'} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={clearer ? '6.2' : '5.2'}
                  fill="var(--welcome-pink)"
                  stroke={clearer ? 'var(--welcome-gold)' : 'var(--welcome-fg)'}
                  strokeOpacity="0.95"
                  strokeWidth={clearer ? '2' : '1.3'}
                />
                <circle cx={point.x} cy={point.y} r="1.6" fill="var(--welcome-fg)" />
              </g>
            ))}
          </g>
          <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fill="none" stroke="var(--welcome-muted)" strokeOpacity="0.32" strokeWidth="0.8" />
        </svg>

        {clearer ? (
          <svg
            className="wg-callout-leaders"
            width={stageSize.width}
            height={stageSize.height}
            viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
            aria-hidden="true"
          >
            {callouts.map(({ activity, point, left, top, width, height }) => {
              const pointX = (stageSize.width - WIDTH * scale) / 2 + point.x * scale;
              const pointY = (stageSize.height - HEIGHT * scale) / 2 + point.y * scale;
              const anchorX = pointX < left ? left : pointX > left + width ? left + width : left + width / 2;
              const anchorY = pointY < top ? top : pointY > top + height ? top + height : top + height / 2;
              return (
                <line
                  key={`leader-${activity.city}`}
                  x1={pointX}
                  y1={pointY}
                  x2={anchorX}
                  y2={anchorY}
                  stroke="var(--welcome-gold)"
                  strokeOpacity="0.8"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              );
            })}
          </svg>
        ) : null}

        {clearer ? null : callouts.map(({ activity, left, top, width, height }) => (
          <div
            className="wg-callout wg-callout-current"
            key={`current-${activity.city}`}
            style={{ left, top, width, minHeight: height }}
            aria-label={`${activity.city}: ${activity.verifiedCompletions} host-verified completions in the last 30 days.`}
          >
            <span className="wg-current-icon"><Users size={15} aria-hidden="true" /></span>
            <span className="wg-current-copy">
              <strong>{activity.city}</strong>
              <small>{activity.verifiedCompletions} verified · 30d</small>
            </span>
          </div>
        ))}

        {clearer ? callouts.map(({ activity, left, top, width, height }) => (
          <div
            className="wg-callout wg-callout-clearer"
            key={`clearer-${activity.city}`}
            style={{ left, top, width, minHeight: height }}
            aria-label={`${activity.city}: ${activity.verifiedCompletions} host-verified completions in the last 30 days.`}
          >
            <span className="wg-clearer-icon"><BadgeCheck size={17} aria-hidden="true" /></span>
            <span className="wg-clearer-copy">
              <strong>{activity.city}</strong>
              <small><b>{activity.verifiedCompletions}</b> verified completions</small>
            </span>
          </div>
        )) : null}
      </div>
    </main>
  );
}
