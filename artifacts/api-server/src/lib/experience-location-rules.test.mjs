import assert from "node:assert/strict";
import test from "node:test";
import { toPublicVerifiedLocation } from "./experience-location-rules.mjs";

function evidence(overrides = {}) {
  return {
    latitude: 51.507234,
    longitude: -0.127612,
    precision: "venue_area",
    sourceType: "venue_site",
    sourceUrl: "https://venue.example.org/visit",
    consentedAt: new Date("2026-09-01T10:00:00.000Z"),
    consentedByUserId: 17,
    reviewStatus: "verified",
    verifiedAt: new Date("2026-09-02T10:00:00.000Z"),
    verifiedByUserId: 9,
    ...overrides,
  };
}

test("public location requires a verified, consented, sourced record", () => {
  assert.equal(toPublicVerifiedLocation(null), null);
  assert.equal(toPublicVerifiedLocation(evidence({ reviewStatus: "pending" })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ consentedAt: null })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ consentedByUserId: null })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ verifiedAt: null })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ verifiedByUserId: null })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ sourceUrl: "http://venue.example.org" })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ sourceType: "map_provider" })), null);
  assert.equal(toPublicVerifiedLocation(evidence({ latitude: 91 })), null);
});

test("public coordinates are rounded to the disclosed precision", () => {
  assert.deepEqual(toPublicVerifiedLocation(evidence()), {
    latitude: 51.507,
    longitude: -0.128,
    precision: "venue_area",
    sourceType: "venue_site",
    sourceUrl: "https://venue.example.org/visit",
    verifiedAt: "2026-09-02T10:00:00.000Z",
  });
  assert.equal(
    toPublicVerifiedLocation(evidence({ precision: "city" })).latitude,
    51.5,
  );
  assert.equal(
    toPublicVerifiedLocation(evidence({ precision: "neighborhood" })).longitude,
    -0.13,
  );
});