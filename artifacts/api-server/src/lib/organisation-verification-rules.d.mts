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

export function verificationReviewReasonError(
  action: string,
  note: string | null | undefined,
): string | null;

export function participationReviewReasonError(
  reason: string | null | undefined,
): string | null;
