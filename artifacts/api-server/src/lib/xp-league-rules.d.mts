export type XpLeagueCategory = "environmental" | "education" | "community";
export type XpLeagueMovement = "held" | "promoted" | "demoted";

export type LeagueWeek = {
  weekStart: string;
  weekEnd: string;
  startAt: Date;
  endAt: Date;
};

export type LeagueEntry = {
  userId: number;
  category?: XpLeagueCategory;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
  scoreXp: number;
  firstAwardedAt?: Date | string | null;
  optedInAt?: Date | string | null;
  optedOutAt?: Date | string | null;
  division: number;
  userType?: string;
  activeAtWeekEnd?: boolean;
  currentlyOptedIn?: boolean;
  isCurrentUser?: boolean;
};

export type RankedLeagueEntry = LeagueEntry & {
  rank: number;
  movement: XpLeagueMovement;
  nextDivision: number;
};

export function getUtcLeagueWeek(now?: Date | string | number): LeagueWeek;
export function compareLeagueEntries(first: LeagueEntry, second: LeagueEntry): number;
export function getXpToNextRank(scoreXp: number, nextRankScoreXp: number | null): number | null;
export function rankLeagueEntries(entries: LeagueEntry[]): RankedLeagueEntry[];
export function buildLeagueStandings(input: {
  members: Array<LeagueEntry & {
    category: XpLeagueCategory;
    optedInAt: Date | string;
    userType: string;
  }>;
  events: Array<{
    userId: number;
    sourceType: string;
    sourceId: string;
    category: XpLeagueCategory;
    amount: number;
    status: string;
    awardedAt: Date | string;
    verifiedAt: Date | string;
  }>;
  category: XpLeagueCategory;
  weekStart: string;
}): RankedLeagueEntry[];
export function filterOptedInLeagueEntries<T extends { optedIn?: boolean }>(entries: T[]): T[];
export function paginateLeagueEntries<T>(
  entries: T[],
  page: number,
  pageSize: number,
): { entries: T[]; page: number; pageSize: number; total: number; hasMore: boolean };
export function buildLeagueHistory(
  standings: Array<{
    weekStart: string;
    rank: number;
    scoreXp: number;
    division: number;
    movement: XpLeagueMovement;
  }>,
  limit?: number,
): Array<{
  weekStart: string;
  weekEnd: string;
  rank: number;
  scoreXp: number;
  division: number;
  movement: XpLeagueMovement;
}>;
export const XP_LEAGUE_CATEGORIES: readonly XpLeagueCategory[];
export const XP_LEAGUE_DIVISIONS: ReadonlyArray<{ level: number; name: string }>;
