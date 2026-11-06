export function distanceBetweenPointsMeters(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const firstLatitude = radians(a.latitude);
  const secondLatitude = radians(b.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

const MAX_SPEED_METERS_PER_SECOND = {
  walk: 4.5,
  run: 12,
  cycle: 35,
};

export function cleanActivityPoints(points, activityType) {
  const maxSpeed = MAX_SPEED_METERS_PER_SECOND[activityType] ?? MAX_SPEED_METERS_PER_SECOND.walk;
  const accepted = [];
  for (const point of points) {
    if (
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      point.longitude < -180 ||
      point.longitude > 180 ||
      (Number.isFinite(point.accuracyMeters) && point.accuracyMeters > 60)
    ) {
      continue;
    }
    const previous = accepted.at(-1);
    if (previous) {
      const elapsedSeconds = (Date.parse(point.recordedAt) - Date.parse(previous.recordedAt)) / 1000;
      if (!(elapsedSeconds > 0 && elapsedSeconds <= 300)) continue;
      const distanceMeters = distanceBetweenPointsMeters(previous, point);
      if (distanceMeters / elapsedSeconds > maxSpeed) continue;
      if (distanceMeters < 1.5) continue;
    }
    accepted.push(point);
  }
  return accepted;
}

export function encodePolyline(points) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let result = "";

  for (const point of points) {
    const latitude = Math.round(point.latitude * 1e5);
    const longitude = Math.round(point.longitude * 1e5);
    for (const delta of [latitude - previousLatitude, longitude - previousLongitude]) {
      let value = delta < 0 ? ~(delta << 1) : delta << 1;
      while (value >= 0x20) {
        result += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      result += String.fromCharCode(value + 63);
    }
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return result;
}

export function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    const deltas = [];
    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      deltas.push((result & 1) ? ~(result >> 1) : result >> 1);
    }
    latitude += deltas[0];
    longitude += deltas[1];
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export function samplePoints(points, maximum = 128) {
  if (points.length <= maximum) return points;
  const selected = [];
  for (let index = 0; index < maximum; index += 1) {
    const sourceIndex = Math.round((index * (points.length - 1)) / (maximum - 1));
    selected.push(points[sourceIndex]);
  }
  return selected;
}

export function calculateElevationGain(profile) {
  if (profile.length < 2) return 0;
  let gain = 0;
  let reference = profile[0].elevationMeters;
  for (const point of profile.slice(1)) {
    const change = point.elevationMeters - reference;
    if (change > 3) {
      gain += change;
      reference = point.elevationMeters;
    } else if (change < -3) {
      reference = point.elevationMeters;
    }
  }
  return Math.max(0, Math.round(gain));
}

export function buildElevationProfile(samples, distanceMeters) {
  if (samples.length < 2) return [];
  return samples.map((sample, index) => ({
    distanceMeters: Math.round((distanceMeters * index) / (samples.length - 1)),
    elevationMeters: sample.elevationMeters,
    resolutionMeters: Number.isFinite(sample.resolutionMeters) ? sample.resolutionMeters : null,
  }));
}

export function calculateActivityMetrics(points, activityType) {
  const cleanPoints = cleanActivityPoints(points, activityType);
  let distanceMeters = 0;
  for (let index = 1; index < cleanPoints.length; index += 1) {
    distanceMeters += distanceBetweenPointsMeters(cleanPoints[index - 1], cleanPoints[index]);
  }
  return {
    points: cleanPoints,
    distanceMeters: Math.round(distanceMeters),
  };
}
