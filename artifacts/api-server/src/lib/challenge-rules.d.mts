export type ExperienceChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "completed";

export function canCreateExperienceChallenge(input: {
  challengerId: number;
  friendId: number;
  friendshipStatus: string | undefined;
  challengerType: string | null;
  friendType: string | null;
  experienceStatus: string;
}): boolean;

export function acceptedChallengeStatus(
  currentStatus: ExperienceChallengeStatus,
  hasVerifiedParticipation: boolean,
): "accepted" | "completed" | null;

export function verifiedChallengeStatus(
  currentStatus: ExperienceChallengeStatus,
): ExperienceChallengeStatus;