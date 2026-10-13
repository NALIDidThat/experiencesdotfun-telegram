export function isVerificationReviewer(configuredTelegramId, currentTelegramId) {
  return (
    typeof configuredTelegramId === "string" &&
    /^\d+$/.test(configuredTelegramId) &&
    typeof currentTelegramId === "string" &&
    configuredTelegramId === currentTelegramId
  );
}

export function isVerificationSelfReview({
  applicantUserId,
  reviewerUserId,
  applicantTelegramId,
  reviewerTelegramId,
}) {
  if (applicantUserId === reviewerUserId) return true;
  return (
    applicantTelegramId != null &&
    reviewerTelegramId != null &&
    String(applicantTelegramId) === String(reviewerTelegramId)
  );
}

export function verificationReviewReasonError(action, note) {
  if (action !== "reject" && action !== "suspend") return null;
  if (typeof note !== "string" || note.trim().length < 5) {
    return "Add a reason of at least 5 characters for rejection or suspension.";
  }
  return null;
}
