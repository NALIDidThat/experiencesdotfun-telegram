export const SOCIAL_QUEST_INVITEE_LIMIT = 8;
export const COMMUNITY_MISSION_TARGET_LIMIT = 500;

export function canInviteToSocialQuest(input) {
  return (
    input.ownerId !== input.invitedUserId &&
    input.ownerType === "participant" &&
    input.invitedUserType === "participant" &&
    (input.friendshipStatus === "accepted" || input.partnershipStatus === "active")
  );
}

export function canJoinSocialQuest(input) {
  return (
    input.questStatus === "active" &&
    input.participantStatus === "invited" &&
    (input.friendshipStatus === "accepted" || input.partnershipStatus === "active")
  );
}

export function canViewSocialQuest(input) {
  if (input.ownerId === input.viewerId) return true;
  return (
    input.isParticipant &&
    (input.friendshipStatus === "accepted" || input.partnershipStatus === "active")
  );
}

export function isTrustedSocialQuestCompletion(input) {
  return input.participationStatus === "verified";
}

export function canGrantCompletionRecognition(input) {
  return input.participantStatus === "active" && input.rewardGrantedAt == null;
}

export function isQualifiedCommunityContribution(input) {
  return (
    input.contributionType === "telegram_message" &&
    input.qualificationReason === "qualified" &&
    input.xpAwarded > 0
  );
}

export function shouldCompleteCommunityMission(input) {
  return (
    input.status === "active" &&
    Number.isSafeInteger(input.progress) &&
    Number.isSafeInteger(input.targetCount) &&
    input.targetCount > 0 &&
    input.progress >= input.targetCount
  );
}
