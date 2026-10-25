import assert from "node:assert/strict";
import { test } from "node:test";
import { isHttpsEvidenceUrl } from "./fund-outcome-report-rules.mjs";

test("outcome evidence requires a valid HTTPS URL", () => {
  assert.equal(isHttpsEvidenceUrl("https://example.org/report"), true);
  assert.equal(isHttpsEvidenceUrl("http://example.org/report"), false);
  assert.equal(isHttpsEvidenceUrl("HTTPS://example.org/report"), true);
  assert.equal(isHttpsEvidenceUrl("https://"), false);
  assert.equal(isHttpsEvidenceUrl("https:///report"), true);
  assert.equal(isHttpsEvidenceUrl("https://bad host/report"), false);
});
