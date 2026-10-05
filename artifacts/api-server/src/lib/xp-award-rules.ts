export const EMAIL_SIGNUP_XP_SOURCE_ID = "signup-bonus";

export type XpAwardView = {
  id: string;
  sourceType:
    | "email_signup"
    | "experience"
    | "milestone"
    | "memory_game"
    | "legacy_balance";
  sourceId: string;
  title: string;
  amount: number;
  status: "pending" | "redeemed";
  awardedAt: string;
};

type PersistedXpAward = {
  id: number;
  sourceType: "email_signup" | "experience" | "milestone" | "memory_game";
  sourceId: string;
  sourceTitle: string;
  amount: number;
  status: "pending" | "redeemed";
  awardedAt: Date | string;
};

type LegacyExperienceAward = {
  participationId: number;
  title: string;
  amount: number;
  awardedAt: Date | string | null;
};

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function buildXpAwardsResponse({
  balanceXp,
  profileCreatedAt,
  persistedAwards,
  legacyExperiences,
  hasLegacyEmailSignup,
  signupXpReward,
}: {
  balanceXp: number;
  profileCreatedAt: Date | string;
  persistedAwards: PersistedXpAward[];
  legacyExperiences: LegacyExperienceAward[];
  hasLegacyEmailSignup: boolean;
  signupXpReward: number;
}) {
  const awards: XpAwardView[] = persistedAwards.map((award) => ({
    id: `award:${award.id}`,
    sourceType: award.sourceType,
    sourceId: award.sourceId,
    title: award.sourceTitle,
    amount: award.amount,
    status: award.status,
    awardedAt: toIsoString(award.awardedAt),
  }));
  const knownSources = new Set(
    persistedAwards.map((award) => `${award.sourceType}:${award.sourceId}`),
  );
  const profileCreatedAtIso = toIsoString(profileCreatedAt);

  if (hasLegacyEmailSignup && !knownSources.has(`email_signup:${EMAIL_SIGNUP_XP_SOURCE_ID}`)) {
    awards.push({
      id: "legacy:email-signup",
      sourceType: "email_signup",
      sourceId: EMAIL_SIGNUP_XP_SOURCE_ID,
      title: "Email sign-up bonus",
      amount: signupXpReward,
      status: "redeemed",
      awardedAt: profileCreatedAtIso,
    });
  }

  for (const experience of legacyExperiences) {
    const sourceId = String(experience.participationId);
    if (
      experience.amount <= 0 ||
      knownSources.has(`experience:${sourceId}`)
    ) {
      continue;
    }
    awards.push({
      id: `legacy:experience:${sourceId}`,
      sourceType: "experience",
      sourceId,
      title: experience.title,
      amount: experience.amount,
      status: "redeemed",
      awardedAt: toIsoString(experience.awardedAt ?? profileCreatedAt),
    });
  }

  const alreadyCreditedXp = awards.reduce(
    (sum, award) => sum + (award.status === "redeemed" ? award.amount : 0),
    0,
  );
  const unmatchedLegacyXp = Math.max(balanceXp - alreadyCreditedXp, 0);
  if (unmatchedLegacyXp > 0) {
    awards.push({
      id: "legacy:balance",
      sourceType: "legacy_balance",
      sourceId: "profile-balance",
      title: "Previously credited XP balance",
      amount: unmatchedLegacyXp,
      status: "redeemed",
      awardedAt: profileCreatedAtIso,
    });
  }

  awards.sort((left, right) => Date.parse(right.awardedAt) - Date.parse(left.awardedAt));
  return {
    balanceXp,
    pendingXp: persistedAwards.reduce(
      (sum, award) => sum + (award.status === "pending" ? award.amount : 0),
      0,
    ),
    awards,
  };
}