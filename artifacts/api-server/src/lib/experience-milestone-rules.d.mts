export type ExperienceMilestoneRewardInput = {
  title: string;
  xpReward: number;
};

export declare const MAX_EXPERIENCE_MILESTONES: number;

export declare function hasValidMilestoneRewardTotal(
  milestones: readonly ExperienceMilestoneRewardInput[] | undefined,
  experienceXpReward: number,
): boolean;

export declare function areAllMilestoneStatusesVerified(
  statuses: readonly (string | null | undefined)[],
): boolean;