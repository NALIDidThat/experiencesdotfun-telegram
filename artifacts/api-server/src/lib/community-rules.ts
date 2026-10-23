export const COMMUNITY_XP_CONFIG = {
  xpPerMessage: 1,
  minimumWords: 7,
  maxQualifyingMessagesPerMinute: 20,
  maxXpPerMember: 250,
  maxDailyXpPerCommunity: 1_000,
  duplicateWindowSeconds: 60,
  leaderboardSize: 10,
  recentContributionLimit: 10,
  adminReward: {
    minimumXp: 1,
    maximumXpPerReward: 20,
    maxXpPerRecipientPerAdminPerDay: 20,
  },
} as const;

export const COMMUNITY_LEVELS = [
  { minimumXp: 0, label: "Newcomer" },
  { minimumXp: 50, label: "Participant" },
  { minimumXp: 200, label: "Contributor" },
  { minimumXp: 500, label: "Community Builder" },
  { minimumXp: 1_000, label: "Community Leader" },
] as const;

export type CommunityMessageReason =
  | "qualified"
  | "not_a_group"
  | "bot_message"
  | "command"
  | "empty_message"
  | "too_short"
  | "duplicate_content"
  | "rate_limited"
  | "member_lifetime_cap"
  | "community_daily_cap";

export function normalizePublicTelegramGroupUsername(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;

  if (/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i.test(candidate)) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`,
      );
      if (!["t.me", "www.t.me", "telegram.me", "www.telegram.me"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      candidate = url.pathname.replace(/^\/+|\/+$/g, "");
      if (candidate.includes("/")) return null;
    } catch {
      return null;
    }
  }

  candidate = candidate.replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(candidate) ? candidate : null;
}

export function isTelegramChatMember(member: {
  status: string;
  is_member?: boolean;
}): boolean {
  return (
    member.status === "creator" ||
    member.status === "administrator" ||
    member.status === "member" ||
    (member.status === "restricted" && member.is_member === true)
  );
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

export function normalizeCommunityModerationPhrase(value: string): string | null {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const length = [...normalized].length;
  if (
    length < 2 ||
    length > 80 ||
    /[\u0000-\u001F\u007F]/u.test(normalized)
  ) {
    return null;
  }
  return normalized.toLowerCase();
}

export function matchesCommunityModerationPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeCommunityModerationPhrase(phrase);
  if (!normalizedPhrase) return false;
  const normalizedText = text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const escapedPhrase = normalizedPhrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const rule = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapedPhrase}(?=$|[^\\p{L}\\p{N}_])`,
    "iu",
  );
  return rule.test(normalizedText);
}

export function getMessageQualification(input: {
  text: string;
  isGroup: boolean;
  isBot: boolean;
}): { qualifies: boolean; wordCount: number; reason: CommunityMessageReason } {
  const text = input.text.trim();
  const wordCount = countWords(text);

  if (!input.isGroup) return { qualifies: false, wordCount, reason: "not_a_group" };
  if (input.isBot) return { qualifies: false, wordCount, reason: "bot_message" };
  if (text.startsWith("/")) return { qualifies: false, wordCount, reason: "command" };
  if (!text) return { qualifies: false, wordCount: 0, reason: "empty_message" };
  if (wordCount < COMMUNITY_XP_CONFIG.minimumWords) {
    return { qualifies: false, wordCount, reason: "too_short" };
  }
  return { qualifies: true, wordCount, reason: "qualified" };
}

export function decideMessageAward(input: {
  isDuplicate: boolean;
  qualifyingMessagesInLastMinute: number;
  memberXp: number;
  communityXpToday: number;
}): { xpAwarded: number; reason: CommunityMessageReason } {
  if (input.isDuplicate) return { xpAwarded: 0, reason: "duplicate_content" };
  if (
    input.qualifyingMessagesInLastMinute >=
    COMMUNITY_XP_CONFIG.maxQualifyingMessagesPerMinute
  ) {
    return { xpAwarded: 0, reason: "rate_limited" };
  }
  if (input.memberXp + COMMUNITY_XP_CONFIG.xpPerMessage > COMMUNITY_XP_CONFIG.maxXpPerMember) {
    return { xpAwarded: 0, reason: "member_lifetime_cap" };
  }
  if (
    input.communityXpToday + COMMUNITY_XP_CONFIG.xpPerMessage >
    COMMUNITY_XP_CONFIG.maxDailyXpPerCommunity
  ) {
    return { xpAwarded: 0, reason: "community_daily_cap" };
  }
  return { xpAwarded: COMMUNITY_XP_CONFIG.xpPerMessage, reason: "qualified" };
}

export function parseAdminRewardAmount(text: string): number | null {
  const match = /^\+([1-9]\d*)$/.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  if (
    !Number.isSafeInteger(amount) ||
    amount < COMMUNITY_XP_CONFIG.adminReward.minimumXp ||
    amount > COMMUNITY_XP_CONFIG.adminReward.maximumXpPerReward
  ) {
    return null;
  }
  return amount;
}

export type AdminRewardDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "invalid_amount"
        | "per_admin_daily_limit"
        | "member_lifetime_cap"
        | "community_daily_cap";
    };

export function decideAdminReward(input: {
  amount: number;
  adminXpToday: number;
  recipientLifetimeXp: number;
  communityXpToday: number;
}): AdminRewardDecision {
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount < COMMUNITY_XP_CONFIG.adminReward.minimumXp ||
    input.amount > COMMUNITY_XP_CONFIG.adminReward.maximumXpPerReward
  ) {
    return { allowed: false, reason: "invalid_amount" };
  }
  if (
    input.adminXpToday + input.amount >
    COMMUNITY_XP_CONFIG.adminReward.maxXpPerRecipientPerAdminPerDay
  ) {
    return { allowed: false, reason: "per_admin_daily_limit" };
  }
  if (
    input.recipientLifetimeXp + input.amount >
    COMMUNITY_XP_CONFIG.maxXpPerMember
  ) {
    return { allowed: false, reason: "member_lifetime_cap" };
  }
  if (
    input.communityXpToday + input.amount >
    COMMUNITY_XP_CONFIG.maxDailyXpPerCommunity
  ) {
    return { allowed: false, reason: "community_daily_cap" };
  }
  return { allowed: true };
}

export function getCommunityLevel(xp: number): {
  label: string;
  minimumXp: number;
  nextLevelXp: number | null;
  progress: number;
} {
  const currentIndex = COMMUNITY_LEVELS.reduce(
    (selected, level, index) => (xp >= level.minimumXp ? index : selected),
    0,
  );
  const current = COMMUNITY_LEVELS[currentIndex];
  const next = COMMUNITY_LEVELS[currentIndex + 1];
  const progress = next
    ? Math.min(100, Math.max(0, ((xp - current.minimumXp) / (next.minimumXp - current.minimumXp)) * 100))
    : 100;
  return {
    label: current.label,
    minimumXp: current.minimumXp,
    nextLevelXp: next?.minimumXp ?? null,
    progress,
  };
}

export function compareCommunityRanks(
  left: { communityXp: number; contributionCount: number; communityXpUpdatedAt: Date; userId: number },
  right: { communityXp: number; contributionCount: number; communityXpUpdatedAt: Date; userId: number },
): number {
  return (
    right.communityXp - left.communityXp ||
    right.contributionCount - left.contributionCount ||
    left.communityXpUpdatedAt.getTime() - right.communityXpUpdatedAt.getTime() ||
    left.userId - right.userId
  );
}