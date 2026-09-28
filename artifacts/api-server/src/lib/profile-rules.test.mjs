import assert from "node:assert/strict";
import test from "node:test";
import { mergeDefinedFields } from "./profile-rules.ts";

test("partial profile edits preserve fields that were not included", () => {
  const existing = {
    website: "https://example.org",
    instagram: "https://instagram.com/old",
    linkedin: "https://linkedin.com/company/example",
  };
  const updated = mergeDefinedFields(existing, {
    instagram: "https://instagram.com/new",
  });

  assert.deepEqual(updated, {
    website: "https://example.org",
    instagram: "https://instagram.com/new",
    linkedin: "https://linkedin.com/company/example",
  });
});

test("undefined fields do not erase saved values", () => {
  const existing = { website: "https://example.org" };
  assert.deepEqual(mergeDefinedFields(existing, { website: undefined }), existing);
});