import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeLocationQuery,
  resolveLocationResults,
} from "../lib/location-resolution.ts";

const place = (overrides) => ({
  id: 1,
  name: "London",
  latitude: 51.50853,
  longitude: -0.12574,
  feature_code: "PPLC",
  country: "United Kingdom",
  admin1: "England",
  population: 8961989,
  ...overrides,
});

test("normalizes common country aliases before geocoding", () => {
  assert.equal(normalizeLocationQuery("  UK "), "United Kingdom");
  assert.equal(normalizeLocationQuery("USA"), "United States");
  assert.equal(normalizeLocationQuery("Somalia"), "Somalia");
});

test("prioritizes a matching city and disambiguates same-name places", () => {
  const results = resolveLocationResults([
    place({ id: 2, country: "Canada", admin1: "Ontario", latitude: 42.98, longitude: -81.23, feature_code: "PPL", population: 422324 }),
    place({ id: 1 }),
    place({ id: 3, name: "London County", feature_code: "ADM1", latitude: 51.5, longitude: -0.1, population: 0 }),
    place({ id: 4, latitude: Number.NaN }),
  ], "London");

  assert.equal(results.length, 3);
  assert.equal(results[0].country, "United Kingdom");
  assert.equal(results[0].display, "London, England, United Kingdom");
  assert.equal(results[1].display, "London, Ontario, Canada");
  assert.equal(results[2].feature_code, "ADM1");
});

test("keeps country results country-level and uses the country's coordinates", () => {
  const [country] = resolveLocationResults([
    place({ id: 9, name: "United Kingdom", feature_code: "PCLI", latitude: 54.75844, longitude: -2.69531 }),
  ], "UK");

  assert.equal(country.name, "United Kingdom");
  assert.equal(country.display, "United Kingdom");
  assert.equal(country.latitude, 54.75844);
  assert.equal(country.longitude, -2.69531);
});
