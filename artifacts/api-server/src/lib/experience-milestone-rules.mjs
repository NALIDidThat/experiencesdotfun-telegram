export const MAX_EXPERIENCE_MILESTONES = 12;

export function hasValidMilestoneRewardTotal(milestones, experienceXpReward) {
  if (milestones === undefined) return true;
  if (
    !Array.isArray(milestones) ||
    milestones.length < 1 ||
    milestones.length > MAX_EXPERIENCE_MILESTONES ||
    !Number.isSafeInteger(experienceXpReward) ||
    experienceXpReward < 0
  ) {
    return false;
  }

  return (
    milestones.every(
      (milestone) =>
        milestone &&
        typeof milestone.title === "string" &&
        milestone.title.trim().length > 0 &&
        Number.isSafeInteger(milestone.xpReward) &&
        milestone.xpReward >= 0,
    ) &&
    milestones.reduce((sum, milestone) => sum + milestone.xpReward, 0) ===
      experienceXpReward
  );
}

export function areAllMilestoneStatusesVerified(statuses) {
  return statuses.length > 0 && statuses.every((status) => status === "verified");
}