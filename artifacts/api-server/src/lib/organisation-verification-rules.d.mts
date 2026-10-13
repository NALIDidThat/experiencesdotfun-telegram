export function isVerificationReviewer(
  configuredTelegramId: string | undefined,
  currentTelegramId: string | undefined,
): boolean;
export function isVerificationSelfReview(args: {
  applicantUserId: number;
  reviewerUserId: number;
  applicantTelegramId: string | number | null | undefined;
  reviewerTelegramId: string | number | null | undefined;
}): boolean;
