export const DIRECT_MESSAGE_MAX_LENGTH = 2000;
export const DIRECT_MESSAGE_RATE_LIMIT = 30;

export type DirectConversationParticipants = {
  participantAUserId: number;
  participantBUserId: number;
};

export function canonicalParticipantPair(
  firstUserId: number,
  secondUserId: number,
): DirectConversationParticipants | null {
  if (
    !Number.isSafeInteger(firstUserId) ||
    !Number.isSafeInteger(secondUserId) ||
    firstUserId <= 0 ||
    secondUserId <= 0 ||
    firstUserId === secondUserId
  ) {
    return null;
  }
  return firstUserId < secondUserId
    ? { participantAUserId: firstUserId, participantBUserId: secondUserId }
    : { participantAUserId: secondUserId, participantBUserId: firstUserId };
}

export function otherParticipantId(
  conversation: DirectConversationParticipants,
  viewerId: number,
): number | null {
  if (conversation.participantAUserId === viewerId) return conversation.participantBUserId;
  if (conversation.participantBUserId === viewerId) return conversation.participantAUserId;
  return null;
}

export function normalizedMessageBody(value: string): string | null {
  const body = value.trim();
  return body.length > 0 && body.length <= DIRECT_MESSAGE_MAX_LENGTH ? body : null;
}

export function isDirectMessageRateLimited(recentMessageCount: number): boolean {
  return recentMessageCount >= DIRECT_MESSAGE_RATE_LIMIT;
}