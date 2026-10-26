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

export type NormalizedCommunityLink = {
  canonicalLink: string;
  normalizedHost: string;
  normalizedPath: string;
};

export type CommunityMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

export function normalizeCommunityLink(value: string): NormalizedCommunityLink | null {
  const candidate = value.normalize("NFKC").trim();
  if (
    !candidate ||
    candidate.length > 2_048 ||
    /[\u0000-\u0020\u007F]/u.test(candidate)
  ) {
    return null;
  }

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(candidate)
    ? candidate
    : `https://${candidate}`;
  try {
    const url = new URL(withScheme);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const normalizedHost = url.hostname.toLowerCase().replace(/\.$/u, "");
    if (!normalizedHost || !normalizedHost.includes(".")) return null;
    const normalizedPath = url.pathname.replace(/\/+$/u, "") || "/";
    return {
      canonicalLink: `https://${normalizedHost}${normalizedPath}`,
      normalizedHost,
      normalizedPath,
    };
  } catch {
    return null;
  }
}

export function extractCommunityMessageLinks(
  text: string,
  entities: readonly CommunityMessageEntity[] = [],
): string[] {
  const candidates: string[] = [];
  for (const entity of entities) {
    if (
      (entity.type !== "url" && entity.type !== "text_link") ||
      !Number.isSafeInteger(entity.offset) ||
      !Number.isSafeInteger(entity.length) ||
      entity.offset < 0 ||
      entity.length <= 0
    ) {
      continue;
    }
    const visibleText = text.slice(entity.offset, entity.offset + entity.length);
    candidates.push(entity.type === "text_link" ? entity.url ?? visibleText : visibleText);
  }

  const linkPattern = /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?<![\w@])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/giu;
  for (const match of text.matchAll(linkPattern)) {
    candidates.push(match[0]);
  }

  const normalizedLinks = new Set<string>();
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[.,!?;:)}\]]+$/u, "");
    const normalized = normalizeCommunityLink(cleaned);
    if (normalized) normalizedLinks.add(normalized.canonicalLink);
  }
  return [...normalizedLinks];
}

export function isCommunityLinkWhitelisted(
  candidate: string,
  allowedLinks: readonly Pick<NormalizedCommunityLink, "normalizedHost" | "normalizedPath">[],
): boolean {
  const normalized = normalizeCommunityLink(candidate);
  if (!normalized) return false;

  return allowedLinks.some((allowed) => {
    const hostMatches = normalized.normalizedHost === allowed.normalizedHost
      || normalized.normalizedHost.endsWith(`.${allowed.normalizedHost}`);
    const pathMatches = allowed.normalizedPath === "/"
      || normalized.normalizedPath === allowed.normalizedPath
      || normalized.normalizedPath.startsWith(`${allowed.normalizedPath}/`);
    return hostMatches && pathMatches;
  });
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
  const match = /^([+-])([1-9]\d*)$/.exec(text);
  if (!match) return null;
  const magnitude = Number(match[2]);
  if (
    !Number.isSafeInteger(magnitude) ||
    magnitude < COMMUNITY_XP_CONFIG.adminReward.minimumXp ||
    magnitude > COMMUNITY_XP_CONFIG.adminReward.maximumXpPerReward
  ) {
    return null;
  }
  return match[1] === "-" ? -magnitude : magnitude;
}

export type AdminRewardDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "invalid_amount"
        | "per_admin_daily_limit"
        | "member_lifetime_cap"
        | "community_daily_cap"
        | "insufficient_member_xp";
    };

export function decideAdminReward(input: {
  amount: number;
  adminXpToday: number;
  recipientLifetimeXp: number;
  communityXpToday: number;
}): AdminRewardDecision {
  if (
    !Number.isSafeInteger(input.amount) ||
    Math.abs(input.amount) < COMMUNITY_XP_CONFIG.adminReward.minimumXp ||
    Math.abs(input.amount) > COMMUNITY_XP_CONFIG.adminReward.maximumXpPerReward
  ) {
    return { allowed: false, reason: "invalid_amount" };
  }
  if (
    input.adminXpToday + Math.abs(input.amount) >
    COMMUNITY_XP_CONFIG.adminReward.maxXpPerRecipientPerAdminPerDay
  ) {
    return { allowed: false, reason: "per_admin_daily_limit" };
  }
  if (input.amount < 0) {
    if (input.recipientLifetimeXp + input.amount < 0) {
      return { allowed: false, reason: "insufficient_member_xp" };
    }
    return { allowed: true };
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