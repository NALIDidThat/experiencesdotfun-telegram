import assert from "node:assert/strict";
import test from "node:test";
import {
  isVerificationReviewer,
  isVerificationSelfReview,
  verificationReviewReasonError,
} from "./organisation-verification-rules.mjs";

test("only the configured numeric Telegram identity can review", () => {
  assert.equal(isVerificationReviewer("1248154114", "1248154114"), true);
  assert.equal(isVerificationReviewer("1248154114", "1248154115"), false);
});

test("missing or mutable reviewer identifiers never grant access", () => {
  assert.equal(isVerificationReviewer(undefined, "1248154114"), false);
  assert.equal(isVerificationReviewer("@nalididthat", "1248154114"), false);
  assert.equal(isVerificationReviewer("1248154114", undefined), false);
});

test("an applicant cannot review their own application through another profile", () => {
  assert.equal(isVerificationSelfReview({
    applicantUserId: 12,
    reviewerUserId: 12,
    applicantTelegramId: "100",
    reviewerTelegramId: "100",
  }), true);
  assert.equal(isVerificationSelfReview({
    applicantUserId: 12,
    reviewerUserId: 34,
    applicantTelegramId: "100",
    reviewerTelegramId: "100",
  }), true);
  assert.equal(isVerificationSelfReview({
    applicantUserId: 12,
    reviewerUserId: 34,
    applicantTelegramId: "100",
    reviewerTelegramId: "200",
  }), false);
});

test("rejection and suspension require an auditable reason", () => {
  assert.match(verificationReviewReasonError("reject", ""), /reason/);
  assert.match(verificationReviewReasonError("suspend", "no"), /reason/);
  assert.equal(verificationReviewReasonError("reject", "Evidence did not match."), null);
  assert.equal(verificationReviewReasonError("approve", null), null);
  assert.equal(verificationReviewReasonError("needs_information", null), null);
});
