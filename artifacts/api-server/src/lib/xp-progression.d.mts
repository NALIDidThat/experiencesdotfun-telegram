export function getExperienceXpProgress(xp: number): {
  level: string;
  levelProgress: number;
  nextLevelXp: number | null;
  xpToNextLevel: number | null;
};

export function buildVerifiedProgression(input: {
  balanceXp: number;
  pendingXp: number;
  verifiedExperiences: Array<{ sourceId?: string | number; status: string; verifiedAt: Date | string | null }>;
  verifiedMilestones: Array<{ sourceId?: string | number; status: string; verifiedAt: Date | string | null }>;
  now?: Date;
}): {
  balanceXp: number;
  pendingXp: number;
  level: string;
  levelProgress: number;
  nextLevelXp: number | null;
  xpToNextLevel: number | null;
  streak: {
    currentDays: number;
    longestDays: number;
    lastVerifiedUtcDate: string | null;
    timezone: "UTC";
  };
  missions: Array<{
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    status: "active" | "completed";
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    unlocked: boolean;
  }>;
  nextAction: { kind: "redeem_xp" | "explore_experiences"; label: string };
  rules: {
    eligibleActivity: string;
    streakDate: string;
    lateVerification: string;
    reset: string;
    excludedActivity: string;
  };
};
