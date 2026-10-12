import assert from "node:assert/strict";
import { test } from "node:test";
import { UpdateMeBody } from "../../../../lib/api-zod/src/generated/api.ts";

const organisationProfile = {
  name: "Community Charity",
  description: "A valid description for the organisation profile.",
  city: "London",
  categories: ["community"],
};

test("organisation profile updates accept supported subtypes and reject arbitrary values", () => {
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

  for (const type of supportedTypes) {
    const result = UpdateMeBody.safeParse({
      organisation: { ...organisationProfile, type },
    });
    assert.equal(result.success, true, `${type} should be accepted`);
  }

  const invalid = UpdateMeBody.safeParse({
    organisation: { ...organisationProfile, type: "unlisted-type" },
  });
  assert.equal(invalid.success, false);
});
