const coordinateDigitsByPrecision = Object.freeze({
  city: 1,
  neighborhood: 2,
  venue_area: 3,
});

const acceptedSourceTypes = new Set([
  "organisation_site",
  "venue_site",
  "public_partner_event",
]);

function validTimestamp(value) {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundCoordinate(value, digits) {
  return Number(value.toFixed(digits));
}

/**
 * Only expose a reviewed, consented location. Coordinate precision is reduced
 * at the API boundary so callers never receive the stored source coordinates.
 * @param {object | null | undefined} evidence
 * @returns {null | {
 *   latitude: number,
 *   longitude: number,
 *   precision: "city" | "neighborhood" | "venue_area",
 *   sourceType: "organisation_site" | "venue_site" | "public_partner_event",
 *   sourceUrl: string,
 *   verifiedAt: string
 * }}
 */
export function toPublicVerifiedLocation(evidence) {
  if (!evidence || evidence.reviewStatus !== "verified") return null;
  const digits = coordinateDigitsByPrecision[evidence.precision];
  if (digits === undefined || !acceptedSourceTypes.has(evidence.sourceType)) {
    return null;
  }
  if (
    !Number.isFinite(evidence.latitude)
    || evidence.latitude < -90
    || evidence.latitude > 90
    || !Number.isFinite(evidence.longitude)
    || evidence.longitude < -180
    || evidence.longitude > 180
    || !evidence.consentedAt
    || !Number.isSafeInteger(evidence.consentedByUserId)
    || evidence.consentedByUserId <= 0
    || !Number.isSafeInteger(evidence.verifiedByUserId)
    || evidence.verifiedByUserId <= 0
  ) {
    return null;
  }

  const verifiedAt = validTimestamp(evidence.verifiedAt);
  if (!verifiedAt || typeof evidence.sourceUrl !== "string") return null;
  try {
    const sourceUrl = new URL(evidence.sourceUrl);
    if (sourceUrl.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    latitude: roundCoordinate(evidence.latitude, digits),
    longitude: roundCoordinate(evidence.longitude, digits),
    precision: evidence.precision,
    sourceType: evidence.sourceType,
    sourceUrl: evidence.sourceUrl,
    verifiedAt: verifiedAt.toISOString(),
  };
}