import assert from "node:assert/strict";
import { test } from "node:test";
import { canLaunchCharityFund } from "./fund-rules.mjs";

test("only charity organisation profiles can launch funds", () => {
  assert.equal(canLaunchCharityFund("organisation", "charity"), true);
  assert.equal(canLaunchCharityFund("organisation", "nonprofit"), false);
  assert.equal(canLaunchCharityFund("participant", "charity"), false);
  assert.equal(canLaunchCharityFund(null, "charity"), false);
});
