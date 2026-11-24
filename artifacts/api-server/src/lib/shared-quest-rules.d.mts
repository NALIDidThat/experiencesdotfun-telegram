export const SOCIAL_QUEST_INVITEE_LIMIT: number;
export const COMMUNITY_MISSION_TARGET_LIMIT: number;

export function canInviteToSocialQuest(input: {
  ownerId: number;
  invitedUserId: number;
  ownerType: string | null;
  invitedUserType: string | null;
  friendshipStatus?: string;
  partnershipStatus?: string;
}): boolean;

export function canJoinSocialQuest(input: {
  questStatus: string;
  participantStatus: string;
  friendshipStatus?: string;
  partnershipStatus?: string;
}): boolean;

export function canViewSocialQuest(input: {
  ownerId: number;
  viewerId: number;
  isParticipant: boolean;
  friendshipStatus?: string;
  partnershipStatus?: string;
}): boolean;

export function isTrustedSocialQuestCompletion(input: {
  participationStatus: string;
}): boolean;

export function canGrantCompletionRecognition(input: {
  participantStatus: string;
  rewardGrantedAt: Date | string | null | undefined;
}): boolean;

export function isQualifiedCommunityContribution(input: {
  contributionType: string;
  qualificationReason: string;
  xpAwarded: number;
}): boolean;

export function shouldCompleteCommunityMission(input: {
  status: string;
  progress: number;
  targetCount: number;
}): boolean;
