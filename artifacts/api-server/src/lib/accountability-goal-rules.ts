export type GoalForCommitmentScope = {
  ownerUserId: number;
  partnershipId: number | null;
  visibility: "private" | "shared";
};

export type CommitmentScopeInput = {
  userId: number;
  assignedUserId: number;
  partnerUserId: number | null;
  partnershipId: number | null;
  goal: GoalForCommitmentScope | null;
};

export type CommitmentScopeResult =
  | { ok: true; scope: "personal" | "shared"; partnershipId: number | null }
  | { ok: false; reason: "private_goal" | "inactive_shared_goal" | "invalid_assignee" };

export function resolveAccountabilityCommitmentScope(
  input: CommitmentScopeInput,
): CommitmentScopeResult {
  const { userId, assignedUserId, partnerUserId, partnershipId, goal } = input;

  if (goal?.visibility === "private") {
    if (
      goal.ownerUserId !== userId
      || goal.partnershipId !== null
      || assignedUserId !== userId
    ) {
      return { ok: false, reason: "private_goal" };
    }
    return { ok: true, scope: "personal", partnershipId: null };
  }

  if (goal?.visibility === "shared") {
    if (
      partnershipId === null
      || goal.partnershipId !== partnershipId
      || partnerUserId === null
      || (goal.ownerUserId !== userId && goal.ownerUserId !== partnerUserId)
    ) {
      return { ok: false, reason: "inactive_shared_goal" };
    }
    if (assignedUserId !== userId && assignedUserId !== partnerUserId) {
      return { ok: false, reason: "invalid_assignee" };
    }
    return { ok: true, scope: "shared", partnershipId };
  }

  if (partnershipId !== null && partnerUserId !== null) {
    if (assignedUserId !== userId && assignedUserId !== partnerUserId) {
      return { ok: false, reason: "invalid_assignee" };
    }
    return { ok: true, scope: "shared", partnershipId };
  }

  if (assignedUserId !== userId) {
    return { ok: false, reason: "invalid_assignee" };
  }
  return { ok: true, scope: "personal", partnershipId: null };
}
