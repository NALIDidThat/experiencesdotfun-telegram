import assert from "node:assert/strict";
import { test } from "node:test";
import { organisationOnboardingCopy } from "../lib/organisation-onboarding-copy.ts";

const supportedTypes = [
  "charity",
  "nonprofit",
  "school",
  "community_centre",
  "library",
  "youth_organisation",
  "business",
  "other",
];

test("organisation onboarding copy covers every supported type with three complete pages", () => {
  assert.deepEqual(Object.keys(organisationOnboardingCopy).sort(), [...supportedTypes].sort());

  for (const type of supportedTypes) {
    const pages = organisationOnboardingCopy[type];
    assert.equal(pages.length, 3, `${type} should have three onboarding pages.`);
    for (const [index, page] of pages.entries()) {
      assert.ok(page.headline.trim(), `${type} page ${index + 1} needs a headline.`);
      assert.ok(page.description.trim(), `${type} page ${index + 1} needs a description.`);
    }
  }
});

test("charity introduction makes fundraising eligibility and review clear", () => {
  assert.match(organisationOnboardingCopy.charity[2].description, /Eligible charity profiles/);
  assert.match(organisationOnboardingCopy.charity[2].description, /after review/);
});
