const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
export const XP_LEAGUE_CATEGORIES = ["environmental", "education", "community"];
export const XP_LEAGUE_DIVISIONS = [
  { level: 1, name: "Bronze" },
  { level: 2, name: "Silver" },
  { level: 3, name: "Gold" },
];

function validDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDateString(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function getUtcLeagueWeek(now = new Date()) {
  const date = validDate(now);
  if (!date) throw new TypeError("A valid date is required to calculate the league week.");
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  const startMs = midnight - daysSinceMonday * DAY_MS;
  return {
    weekStart: utcDateString(startMs),
    weekEnd: utcDateString(startMs + WEEK_MS),
    startAt: new Date(startMs),
    endAt: new Date(startMs + WEEK_MS),
  };
}

export function compareLeagueEntries(first, second) {
  if (first.scoreXp !== second.scoreXp) return second.scoreXp - first.scoreXp;
  const firstAward = validDate(first.firstAwardedAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const secondAward = validDate(second.firstAwardedAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (firstAward !== secondAward) return firstAward - secondAward;
  const firstOptIn = validDate(first.optedInAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const secondOptIn = validDate(second.optedInAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (firstOptIn !== secondOptIn) return firstOptIn - secondOptIn;
  return Number(first.userId) - Number(second.userId);
}

export function getXpToNextRank(scoreXp, nextRankScoreXp) {
  if (nextRankScoreXp === null || nextRankScoreXp === undefined) return null;
  const score = Math.max(0, Math.floor(Number(scoreXp) || 0));
  const nextScore = Math.max(0, Math.floor(Number(nextRankScoreXp) || 0));
  return Math.max(0, nextScore - score + 1);
}

export function rankLeagueEntries(entries) {
  const byDivision = new Map(XP_LEAGUE_DIVISIONS.map(({ level }) => [level, []]));
  for (const entry of entries) {
    if (!byDivision.has(Number(entry.division))) continue;
    byDivision.get(Number(entry.division)).push(entry);
  }

  const standings = [];
  for (const [division, divisionEntries] of byDivision) {
    divisionEntries.sort(compareLeagueEntries);
    const moveCount = divisionEntries.length >= 5
      ? Math.floor(divisionEntries.length * 0.2)
      : 0;
    divisionEntries.forEach((entry, index) => {
      let movement = "held";
      let nextDivision = division;
      if (
        moveCount > 0
        && division < 3
        && index < moveCount
        && entry.activeAtWeekEnd !== false
      ) {
        movement = "promoted";
        nextDivision += 1;
      } else if (
        moveCount > 0
        && division > 1
        && index >= divisionEntries.length - moveCount
        && entry.activeAtWeekEnd !== false
      ) {
        movement = "demoted";
        nextDivision -= 1;
      }
      standings.push({ ...entry, rank: index + 1, movement, nextDivision });
    });
  }
  return standings;
}

export function buildLeagueStandings({ members, events, category, weekStart }) {
  if (!XP_LEAGUE_CATEGORIES.includes(category)) {
    throw new TypeError("Choose a supported Experience category.");
  }
  const week = getUtcLeagueWeek(new Date(`${weekStart}T12:00:00.000Z`));
  if (week.weekStart !== weekStart) {
    throw new TypeError("League standings require a UTC Monday week start.");
  }

  const eligibleMembers = members.filter((member) => {
    const optedInAt = validDate(member.optedInAt);
    const optedOutAt = validDate(member.optedOutAt);
    return member.category === category
      && member.userType === "participant"
      && optedInAt
      && optedInAt < week.endAt
      && (!optedOutAt || optedOutAt >= week.endAt);
  });
  const memberById = new Map(eligibleMembers.map((member) => [Number(member.userId), member]));
  const totals = new Map();
  const seenSources = new Set();

  for (const event of events) {
    const userId = Number(event.userId);
    const member = memberById.get(userId);
    const amount = Number(event.amount);
    const awardedAt = validDate(event.awardedAt);
    const verifiedAt = validDate(event.verifiedAt);
    if (
      !member
      || event.category !== category
      || !["experience", "milestone"].includes(event.sourceType)
      || (event.sourceType === "experience" && event.parentParticipationStatus !== "verified")
      || event.status !== "verified"
      || !event.sourceId
      || !Number.isSafeInteger(amount)
      || amount <= 0
      || !awardedAt
      || !verifiedAt
      || awardedAt.getTime() !== verifiedAt.getTime()
      || awardedAt < week.startAt
      || awardedAt >= week.endAt
      || awardedAt < validDate(member.optedInAt)
      || (member.optedOutAt && awardedAt >= validDate(member.optedOutAt))
    ) {
      continue;
    }
    const sourceKey = `${userId}:${event.sourceType}:${event.sourceId}`;
    if (seenSources.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    const total = totals.get(userId) ?? { scoreXp: 0, firstAwardedAt: awardedAt };
    total.scoreXp += amount;
    if (awardedAt < total.firstAwardedAt) total.firstAwardedAt = awardedAt;
    totals.set(userId, total);
  }

  const entries = [];
  for (const member of eligibleMembers) {
    const summary = totals.get(Number(member.userId));
    const entry = {
      userId: Number(member.userId),
      name: member.name,
      username: member.username ?? null,
      avatarUrl: member.avatarUrl ?? null,
      category,
      scoreXp: summary?.scoreXp ?? 0,
      firstAwardedAt: summary?.firstAwardedAt ?? null,
      optedInAt: member.optedInAt,
      division: Number(member.division),
      isCurrentUser: Number(member.userId) === Number(member.currentUserId),
      activeAtWeekEnd: !member.optedOutAt || validDate(member.optedOutAt) >= week.endAt,
    };
    entries.push(entry);
  }
  return rankLeagueEntries(entries);
}

export function filterOptedInLeagueEntries(entries) {
  return entries.filter((entry) => entry.optedIn === true);
}

export function paginateLeagueEntries(entries, page, pageSize) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.min(20, Math.max(1, Math.floor(Number(pageSize) || 20)));
  const start = (safePage - 1) * safePageSize;
  return {
    entries: entries.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: entries.length,
    hasMore: start + safePageSize < entries.length,
  };
}

export function buildLeagueHistory(standings, limit = 12) {
  return [...standings]
    .sort((first, second) => String(second.weekStart).localeCompare(String(first.weekStart)))
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((standing) => {
      const start = validDate(`${standing.weekStart}T00:00:00.000Z`);
      if (!start) return null;
      return {
        weekStart: utcDateString(start),
        weekEnd: utcDateString(start.getTime() + WEEK_MS),
        rank: Number(standing.rank),
        scoreXp: Number(standing.scoreXp),
        division: Number(standing.division),
        movement: standing.movement,
      };
    })
    .filter(Boolean);
}
