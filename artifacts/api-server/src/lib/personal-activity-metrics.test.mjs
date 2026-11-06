import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElevationProfile,
  calculateActivityMetrics,
  calculateElevationGain,
  decodePolyline,
  encodePolyline,
  samplePoints,
} from "./personal-activity-metrics.mjs";

test("encoded route polylines round-trip representative coordinates", () => {
  const route = [
    { latitude: 51.5072, longitude: -0.1276 },
    { latitude: 51.5081, longitude: -0.1261 },
    { latitude: 51.5092, longitude: -0.1248 },
  ];
  const decoded = decodePolyline(encodePolyline(route));
  assert.equal(decoded.length, route.length);
  route.forEach((point, index) => {
    assert.ok(Math.abs(decoded[index].latitude - point.latitude) < 0.00001);
    assert.ok(Math.abs(decoded[index].longitude - point.longitude) < 0.00001);
  });
});

test("track distance ignores inaccurate, duplicate, and implausible GPS points", () => {
  const start = { latitude: 51.5, longitude: -0.12, accuracyMeters: 8, recordedAt: "2026-11-06T10:00:00.000Z" };
  const next = { latitude: 51.50025, longitude: -0.12, accuracyMeters: 10, recordedAt: "2026-11-06T10:00:10.000Z" };
  const inaccurate = { latitude: 51.501, longitude: -0.12, accuracyMeters: 100, recordedAt: "2026-11-06T10:00:20.000Z" };
  const jump = { latitude: 51.51, longitude: -0.12, accuracyMeters: 4, recordedAt: "2026-11-06T10:00:21.000Z" };
  const result = calculateActivityMetrics([start, next, inaccurate, jump], "walk");
  assert.equal(result.points.length, 2);
  assert.ok(result.distanceMeters > 20 && result.distanceMeters < 40);
});

test("elevation gain uses provider samples and filters small vertical noise", () => {
  const profile = [
    { distanceMeters: 0, elevationMeters: 10, resolutionMeters: 20 },
    { distanceMeters: 100, elevationMeters: 11, resolutionMeters: 20 },
    { distanceMeters: 200, elevationMeters: 16, resolutionMeters: 20 },
    { distanceMeters: 300, elevationMeters: 15, resolutionMeters: 20 },
    { distanceMeters: 400, elevationMeters: 20, resolutionMeters: 20 },
  ];
  assert.equal(calculateElevationGain(profile), 10);
  assert.deepEqual(buildElevationProfile(profile, 400).map((point) => point.distanceMeters), [0, 100, 200, 300, 400]);
});

test("elevation sampling is bounded and preserves route endpoints", () => {
  const points = Array.from({ length: 2_000 }, (_, index) => ({ latitude: index / 100_000, longitude: index / 200_000 }));
  const sampled = samplePoints(points, 128);
  assert.equal(sampled.length, 128);
  assert.deepEqual(sampled[0], points[0]);
  assert.deepEqual(sampled.at(-1), points.at(-1));
});
