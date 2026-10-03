const challengeableExperienceStatuses = new Set(["published", "full"]);

export function canCreateExperienceChallenge({
  challengerId,
  friendId,
  friendshipStatus,
  challengerType,
  friendType,
  experienceStatus,
}) {
  return (
    Number.isSafeInteger(challengerId) &&
    Number.isSafeInteger(friendId) &&
    challengerId !== friendId &&
    friendshipStatus === "accepted" &&
    challengerType === "participant" &&
    friendType === "participant" &&
    challengeableExperienceStatuses.has(experienceStatus)
  );
}

export function acceptedChallengeStatus(currentStatus, hasVerifiedParticipation) {
  if (currentStatus !== "pending") return null;
  return hasVerifiedParticipation ? "completed" : "accepted";
}

export function verifiedChallengeStatus(currentStatus) {
  return currentStatus === "accepted" ? "completed" : currentStatus;
}