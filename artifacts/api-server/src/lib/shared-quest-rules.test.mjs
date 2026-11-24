import assert from "node:assert/strict";
import test from "node:test";
import {
  canInviteToSocialQuest,
  canJoinSocialQuest,
  canGrantCompletionRecognition,
  canViewSocialQuest,
  isQualifiedCommunityContribution,
  isTrustedSocialQuestCompletion,
  shouldCompleteCommunityMission,
  SOCIAL_QUEST_INVITEE_LIMIT,
  COMMUNITY_MISSION_TARGET_LIMIT,
} from "./shared-quest-rules.mjs";

test("social quests only invite accepted participant friends or active partners", () => {
  const valid = {
    ownerId: 10,
    invitedUserId: 20,
    ownerType: "participant",
    invitedUserType: "participant",
    friendshipStatus: "accepted",
    partnershipStatus: undefined,
  };
  assert.equal(canInviteToSocialQuest(valid), true);
  assert.equal(canInviteToSocialQuest({ ...valid, friendshipStatus: "pending" }), false);
  assert.equal(canInviteToSocialQuest({
    ...valid,
    friendshipStatus: "pending",
    partnershipStatus: "ended",
  }), false);
  assert.equal(canInviteToSocialQuest({ ...valid, invitedUserType: "organisation" }), false);
  assert.equal(canInviteToSocialQuest({ ...valid, invitedUserId: 10 }), false);
  assert.equal(SOCIAL_QUEST_INVITEE_LIMIT, 8);
});

test("only active quests with a current relationship can be joined", () => {
  const valid = {
    questStatus: "active",
    participantStatus: "invited",
    friendshipStatus: "accepted",
  };
  assert.equal(canJoinSocialQuest(valid), true);
  assert.equal(canJoinSocialQuest({ ...valid, questStatus: "completed" }), false);
  assert.equal(canJoinSocialQuest({ ...valid, participantStatus: "declined" }), false);
  assert.equal(canJoinSocialQuest({ ...valid, friendshipStatus: "ended" }), false);
});

test("social quest visibility stays with the owner and current participants in the relationship", () => {
  const member = {
    ownerId: 10,
    viewerId: 20,
    isParticipant: true,
    friendshipStatus: "accepted",
  };
  assert.equal(canViewSocialQuest(member), true);
  assert.equal(canViewSocialQuest({ ...member, friendshipStatus: "ended" }), false);
  assert.equal(canViewSocialQuest({ ...member, isParticipant: false }), false);
  assert.equal(canViewSocialQuest({ ...member, ownerId: 20, viewerId: 20, isParticipant: true }), true);
});

test("social quest completion requires verified experience participation", () => {
  assert.equal(isTrustedSocialQuestCompletion({ participationStatus: "verified" }), true);
  assert.equal(isTrustedSocialQuestCompletion({ participationStatus: "joined" }), false);
  assert.equal(isTrustedSocialQuestCompletion({ participationStatus: "pending" }), false);
});

test("completion recognition is issued only once to a joined participant", () => {
  assert.equal(canGrantCompletionRecognition({
    participantStatus: "active",
    rewardGrantedAt: null,
  }), true);
  assert.equal(canGrantCompletionRecognition({
    participantStatus: "completed",
    rewardGrantedAt: new Date(),
  }), false);
  assert.equal(canGrantCompletionRecognition({
    participantStatus: "invited",
    rewardGrantedAt: null,
  }), false);
});

test("community missions count only positive awards from qualified ledger messages", () => {
  assert.equal(isQualifiedCommunityContribution({
    contributionType: "telegram_message",
    qualificationReason: "qualified",
    xpAwarded: 1,
  }), true);
  assert.equal(isQualifiedCommunityContribution({
    contributionType: "telegram_message",
    qualificationReason: "member_lifetime_cap",
    xpAwarded: 0,
  }), false);
  assert.equal(isQualifiedCommunityContribution({
    contributionType: "admin_reward",
    qualificationReason: "admin_recognition",
    xpAwarded: 1,
  }), false);
  assert.equal(shouldCompleteCommunityMission({ status: "active", progress: 5, targetCount: 5 }), true);
  assert.equal(shouldCompleteCommunityMission({ status: "completed", progress: 8, targetCount: 5 }), false);
  assert.equal(shouldCompleteCommunityMission({ status: "active", progress: 4, targetCount: 5 }), false);
  assert.equal(COMMUNITY_MISSION_TARGET_LIMIT, 500);
});
