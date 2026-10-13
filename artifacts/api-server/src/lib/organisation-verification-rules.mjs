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
