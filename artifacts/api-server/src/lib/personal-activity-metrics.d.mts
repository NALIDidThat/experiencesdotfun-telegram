export type ActivityPoint = {
  sequence?: number;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt: string;
};

export type ElevationPoint = {
  distanceMeters: number;
  elevationMeters: number;
  resolutionMeters: number | null;
};

export function distanceBetweenPointsMeters(
  a: ActivityPoint,
  b: ActivityPoint,
): number;
export function cleanActivityPoints(
  points: ActivityPoint[],
  activityType: "walk" | "run" | "cycle",
): ActivityPoint[];
export function encodePolyline(
  points: Array<Pick<ActivityPoint, "latitude" | "longitude">>,
): string;
export function decodePolyline(encoded: string): Array<
  Pick<ActivityPoint, "latitude" | "longitude">
>;
export function samplePoints<T>(points: T[], maximum?: number): T[];
export function calculateElevationGain(profile: ElevationPoint[]): number;
export function buildElevationProfile(
  samples: Array<{ elevationMeters: number; resolutionMeters: number | null }>,
  distanceMeters: number,
): ElevationPoint[];
export function calculateActivityMetrics(
  points: ActivityPoint[],
  activityType: "walk" | "run" | "cycle",
): { points: ActivityPoint[]; distanceMeters: number };
