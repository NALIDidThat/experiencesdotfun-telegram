import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { Router, type Response } from "express";
import {
  GetMyXpLeagueQueryParams,
  GetMyXpLeagueResponse,
  UpdateMyXpLeagueOptInBody,
  UpdateMyXpLeagueOptInResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  xpLeagueMembershipsTable,
  xpLeagueStandingsTable,
  xpLeagueWeeksTable,
} from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  buildLeagueHistory,
  filterOptedInLeagueEntries,
  getXpToNextRank,
  getUtcLeagueWeek,
  rankLeagueEntries,
  type XpLeagueCategory,
} from "../lib/xp-league-rules.mjs";

const router = Router();
router.use(requireTelegramUser);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 50;
const HISTORY_WEEKS = 12;
const DIVISION_NAMES = ["Bronze", "Silver", "Gold"] as const;
const RULES = {
  scoring: "Only unique, host-verified Experience completion and milestone XP awards count; the award's verification-time timestamp is used, regardless of redemption.",
  weekBoundary: "Each week runs Monday 00:00 UTC up to, but not including, the next Monday 00:00 UTC.",
  privacy: "Joining is optional and separate for Environmental, Education, and Community. Only opted-in participant profiles appear. Leaving removes your name from league history.",
  tieBreak: "Higher XP ranks first, then the earlier first qualifying award, earlier opt-in, and lower profile ID.",
  movement: "Three divisions start at Bronze. Final ranks and movement count profiles still opted in at week end. In divisions with at least five entrants, the top and bottom 20% (rounded down, at least one) move one division up or down; ties use the published tie-break order. Gold has no promotion; Bronze has no demotion.",
  history: "Weekly standings are finalized once after the UTC week closes. The app shows the latest 12 weeks; saved standings remain while opted in, and leaving deletes that profile's stored history.",
};

type LeagueExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type Week = ReturnType<typeof getUtcLeagueWeek>;

let leagueSchemaPromise: Promise<boolean> | undefined;

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

async function ensureLeagueSchema(res: Response): Promise<boolean> {
  try {
    leagueSchemaPromise ??= db.execute(sql`
      SELECT
        to_regclass('public.xp_league_memberships') IS NOT NULL AS memberships,
        to_regclass('public.xp_league_standings') IS NOT NULL AS standings,
        to_regclass('public.xp_league_weeks') IS NOT NULL AS weeks
    `).then((result) => {
      const row = result.rows[0] as {
        memberships?: boolean;
        standings?: boolean;
        weeks?: boolean;
      } | undefined;
      return Boolean(row?.memberships && row.standings && row.weeks);
    });
    if (await leagueSchemaPromise) return true;
    leagueSchemaPromise = undefined;
  } catch {
    leagueSchemaPromise = undefined;
  }
  sendError(
    res,
    503,
    "Weekly Experience XP Leagues are unavailable until their database migration is applied.",
  );
  return false;
}

function isParticipant(user: ReturnType<typeof currentUser>, res: Response) {
  if (user.userType === "participant") return true;
  sendError(
    res,
    user.userType === null ? 409 : 403,
    user.userType === null
      ? "Choose a Participant profile before joining an Experience XP League."
      : "Weekly Experience XP Leagues are available to Participant profiles.",
  );
  return false;
}

function weekBefore(week: Week): Week {
  return getUtcLeagueWeek(new Date(week.startAt.getTime() - 1));
}

function verifiedAwardsCte(week: Week, category: XpLeagueCategory) {
  return sql`
    WITH verified_awards AS (
      SELECT award.user_id, award.source_category AS category, award.amount, award.awarded_at
      FROM xp_awards AS award
      INNER JOIN participations AS participation
        ON award.source_type = 'experience'
        AND award.source_id = participation.id::text
        AND award.user_id = participation.user_id
        AND participation.status = 'verified'
        AND participation.verified_at = award.awarded_at
      INNER JOIN experiences AS experience
        ON experience.id = participation.experience_id
      WHERE award.source_type = 'experience'
        AND award.source_category = ${category}
        AND award.amount > 0
        AND award.awarded_at >= ${week.startAt}
        AND award.awarded_at < ${week.endAt}
      UNION ALL
      SELECT award.user_id, award.source_category AS category, award.amount, award.awarded_at
      FROM xp_awards AS award
      INNER JOIN experience_milestone_submissions AS submission
        ON award.source_type = 'milestone'
        AND award.source_id = submission.id::text
        AND submission.status = 'verified'
        AND submission.verified_at = award.awarded_at
      INNER JOIN participations AS participation
        ON participation.id = submission.participation_id
        AND participation.user_id = award.user_id
      INNER JOIN experiences AS experience
        ON experience.id = participation.experience_id
      WHERE award.source_type = 'milestone'
        AND award.source_category = ${category}
        AND award.amount > 0
        AND award.awarded_at >= ${week.startAt}
        AND award.awarded_at < ${week.endAt}
    )
  `;
}

async function readMembersForWeek(
  executor: LeagueExecutor,
  category: XpLeagueCategory,
  week: Week,
) {
  const cte = verifiedAwardsCte(week, category);
  const result = await executor.execute(sql`
    ${cte}
    SELECT
      membership.id AS "membershipId",
      membership.user_id AS "userId",
      membership.category,
      membership.division,
      membership.opted_in_at AS "optedInAt",
      membership.opted_out_at AS "optedOutAt",
      membership.opted_out_at IS NULL AS "currentlyOptedIn",
      membership.opted_out_at IS NULL OR membership.opted_out_at >= ${week.endAt}
        AS "activeAtWeekEnd",
      person.user_type AS "userType",
      person.name,
      person.username,
      person.avatar_url AS "avatarUrl",
      COALESCE(SUM(award.amount), 0)::bigint AS "scoreXp",
      MIN(award.awarded_at) AS "firstAwardedAt"
    FROM xp_league_memberships AS membership
    INNER JOIN users AS person ON person.id = membership.user_id
    LEFT JOIN verified_awards AS award
      ON award.user_id = membership.user_id
      AND award.category = membership.category
      AND award.awarded_at >= GREATEST(membership.opted_in_at, ${week.startAt})
      AND award.awarded_at < LEAST(COALESCE(membership.opted_out_at, ${week.endAt}), ${week.endAt})
    WHERE membership.category = ${category}
      AND membership.opted_in_at < ${week.endAt}
      AND (membership.opted_out_at IS NULL OR membership.opted_out_at >= ${week.endAt})
      AND person.user_type = 'participant'
    GROUP BY
      membership.id, membership.user_id, membership.category, membership.division,
      membership.opted_in_at, membership.opted_out_at, person.user_type,
      person.name, person.username, person.avatar_url
  `);
  return result.rows as Array<{
    membershipId: number;
    userId: number;
    category: string;
    division: number;
    optedInAt: Date;
    optedOutAt: Date | null;
    currentlyOptedIn: boolean;
    activeAtWeekEnd: boolean;
    userType: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    scoreXp: number | string;
    firstAwardedAt: Date | null;
  }>;
}

async function finalizeLeagueWeek(category: XpLeagueCategory, week: Week): Promise<void> {
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"xp-league:" + category + ":" + week.weekStart}, 0))`,
    );
    const [existing] = await transaction
      .select({ id: xpLeagueWeeksTable.id })
      .from(xpLeagueWeeksTable)
      .where(and(
        eq(xpLeagueWeeksTable.category, category as typeof xpLeagueWeeksTable.$inferSelect.category),
        eq(xpLeagueWeeksTable.weekStart, week.weekStart),
      ))
      .limit(1);
    if (existing) return;

    const sourceRows = await readMembersForWeek(transaction, category, week);
    const eligible = sourceRows.map((row) => ({
      userId: Number(row.userId),
      name: row.name,
      username: row.username,
      avatarUrl: row.avatarUrl,
      category,
      scoreXp: Number(row.scoreXp),
      firstAwardedAt: row.firstAwardedAt,
      optedInAt: row.optedInAt,
      optedOutAt: row.optedOutAt,
      division: Number(row.division),
      userType: row.userType,
      activeAtWeekEnd: row.activeAtWeekEnd,
      currentlyOptedIn: row.currentlyOptedIn,
    }));
    const standings = rankLeagueEntries(eligible);

    const visibleHistory = standings.filter((entry) => entry.currentlyOptedIn);
    if (visibleHistory.length > 0) {
      await transaction.insert(xpLeagueStandingsTable).values(
        visibleHistory.map((entry) => ({
          weekStart: week.weekStart,
          category: category as typeof xpLeagueStandingsTable.$inferSelect.category,
          userId: entry.userId,
          division: entry.division,
          scoreXp: entry.scoreXp,
          rank: entry.rank,
          movement: entry.movement as "held" | "promoted" | "demoted",
        })),
      ).onConflictDoNothing();
    }

    for (const entry of standings) {
      if (
        entry.currentlyOptedIn
        && entry.activeAtWeekEnd
        && entry.nextDivision !== entry.division
      ) {
        await transaction
          .update(xpLeagueMembershipsTable)
          .set({ division: entry.nextDivision, updatedAt: week.endAt })
          .where(and(
            eq(xpLeagueMembershipsTable.userId, entry.userId),
            eq(xpLeagueMembershipsTable.category, category as typeof xpLeagueMembershipsTable.$inferSelect.category),
            eq(xpLeagueMembershipsTable.division, entry.division),
            isNull(xpLeagueMembershipsTable.optedOutAt),
          ));
      }
    }
    await transaction.insert(xpLeagueWeeksTable).values({
      weekStart: week.weekStart,
      category: category as typeof xpLeagueWeeksTable.$inferSelect.category,
    }).onConflictDoNothing();
  });
}

async function finalizeClosedWeeks(category: XpLeagueCategory, currentWeek: Week) {
  const [oldest] = await db
    .select({ optedInAt: xpLeagueMembershipsTable.optedInAt })
    .from(xpLeagueMembershipsTable)
    .where(and(
      eq(
        xpLeagueMembershipsTable.category,
        category as typeof xpLeagueMembershipsTable.$inferSelect.category,
      ),
      isNull(xpLeagueMembershipsTable.optedOutAt),
    ))
    .orderBy(asc(xpLeagueMembershipsTable.optedInAt))
    .limit(1);
  if (!oldest) return;
  const [lastFinalized] = await db
    .select({ weekStart: xpLeagueWeeksTable.weekStart })
    .from(xpLeagueWeeksTable)
    .where(eq(
      xpLeagueWeeksTable.category,
      category as typeof xpLeagueWeeksTable.$inferSelect.category,
    ))
    .orderBy(desc(xpLeagueWeeksTable.weekStart))
    .limit(1);
  const nextWeekStart = lastFinalized
    ? new Date(`${lastFinalized.weekStart}T12:00:00.000Z`).getTime() + 7 * 24 * 60 * 60 * 1000
    : getUtcLeagueWeek(oldest.optedInAt).startAt.getTime();
  let week = getUtcLeagueWeek(new Date(nextWeekStart));
  const lastClosedWeek = weekBefore(currentWeek);
  while (week.startAt < currentWeek.startAt) {
    if (week.startAt <= lastClosedWeek.startAt) {
      await finalizeLeagueWeek(category, week);
    }
    week = getUtcLeagueWeek(new Date(week.startAt.getTime() + 7 * 24 * 60 * 60 * 1000));
  }
}

async function readLiveLeaderboard(
  category: XpLeagueCategory,
  week: Week,
  userId: number,
  division: number,
  page: number,
  pageSize: number,
) {
  const cte = verifiedAwardsCte(week, category);
  const offset = (page - 1) * pageSize;
  const upperBound = offset + pageSize;
  const result = await db.execute(sql`
    ${cte},
    member_scores AS (
      SELECT
        membership.user_id AS "userId",
        person.name,
        person.username,
        person.avatar_url AS "avatarUrl",
        membership.division,
        membership.opted_in_at AS "optedInAt",
        COALESCE(SUM(award.amount), 0)::bigint AS "scoreXp",
        MIN(award.awarded_at) AS "firstAwardedAt"
      FROM xp_league_memberships AS membership
      INNER JOIN users AS person ON person.id = membership.user_id
      LEFT JOIN verified_awards AS award
        ON award.user_id = membership.user_id
        AND award.category = membership.category
        AND award.awarded_at >= GREATEST(membership.opted_in_at, ${week.startAt})
        AND award.awarded_at < ${week.endAt}
      WHERE membership.category = ${category}
        AND membership.opted_out_at IS NULL
        AND membership.opted_in_at < ${week.endAt}
        AND membership.division = ${division}
        AND person.user_type = 'participant'
      GROUP BY
        membership.user_id, person.name, person.username, person.avatar_url,
        membership.division, membership.opted_in_at
    ),
    ranked AS (
      SELECT
        member_scores.*,
        row_number() OVER (
          PARTITION BY division
          ORDER BY "scoreXp" DESC, "firstAwardedAt" ASC NULLS LAST, "optedInAt" ASC, "userId" ASC
        )::int AS rank,
        count(*) OVER (PARTITION BY division)::int AS total
      FROM member_scores
    ),
    ranked_with_targets AS (
      SELECT
        ranked.*,
        LAG("scoreXp") OVER (PARTITION BY division ORDER BY rank) AS "nextScoreXp"
      FROM ranked
    )
    SELECT 'page' AS record_type, rank, "userId", name, username, "avatarUrl",
      "scoreXp", division, total, "nextScoreXp"
    FROM ranked_with_targets
    WHERE rank > ${offset} AND rank <= ${upperBound}
    UNION ALL
    SELECT 'current' AS record_type, rank, "userId", name, username, "avatarUrl",
      "scoreXp", division, total, "nextScoreXp"
    FROM ranked_with_targets
    WHERE "userId" = ${userId}
      AND NOT (rank > ${offset} AND rank <= ${upperBound})
    ORDER BY record_type DESC, rank ASC
  `);
  return result.rows as Array<{
    record_type: "page" | "current";
    rank: number;
    userId: number;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    scoreXp: number | string;
    division: number;
    total: number;
    nextScoreXp: number | string | null;
  }>;
}

router.get("/", async (req, res): Promise<void> => {
  const query = GetMyXpLeagueQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Choose a valid league category and page." });
    return;
  }
  const user = currentUser(req);
  if (!isParticipant(user, res)) return;
  if (!(await ensureLeagueSchema(res))) return;

  const category = query.data.category;
  const now = new Date();
  const week = getUtcLeagueWeek(now);
  const [membership] = await db
    .select()
    .from(xpLeagueMembershipsTable)
    .where(and(
      eq(xpLeagueMembershipsTable.userId, user.id),
      eq(xpLeagueMembershipsTable.category, category),
      isNull(xpLeagueMembershipsTable.optedOutAt),
    ))
    .limit(1);

  if (!membership) {
    res.json(GetMyXpLeagueResponse.parse({
      category,
      optedIn: false,
      effectiveAt: null,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      timezone: "UTC",
      division: null,
      currentStanding: null,
      members: [],
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: 0,
      hasMore: false,
      history: [],
      rules: RULES,
    }));
    return;
  }

  await finalizeClosedWeeks(category, week);
  const [currentMembership] = await db
    .select()
    .from(xpLeagueMembershipsTable)
    .where(and(
      eq(xpLeagueMembershipsTable.userId, user.id),
      eq(xpLeagueMembershipsTable.category, category),
      isNull(xpLeagueMembershipsTable.optedOutAt),
    ))
    .limit(1);
  if (!currentMembership) {
    res.status(409).json({ message: "Your league opt-in changed. Reload this category to continue." });
    return;
  }
  const rows = await readLiveLeaderboard(
    category,
    week,
    user.id,
    currentMembership.division,
    query.data.page,
    query.data.pageSize,
  );
  const pageEntries = filterOptedInLeagueEntries(
    rows
      .filter((row) => row.record_type === "page")
      .map((row) => ({ ...row, optedIn: true })),
  );
  const currentRow = rows.find((row) => row.userId === user.id);
  const total = Number(currentRow?.total ?? pageEntries[0]?.total ?? 0);
  const members = pageEntries.map((row) => ({
    rank: Number(row.rank),
    userId: Number(row.userId),
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    scoreXp: Number(row.scoreXp),
    xpToNextRank: getXpToNextRank(
      Number(row.scoreXp),
      row.nextScoreXp === null ? null : Number(row.nextScoreXp),
    ),
    division: Number(row.division),
    isCurrentUser: Number(row.userId) === user.id,
  }));
  const currentStanding = currentRow
    ? {
        rank: Number(currentRow.rank),
        userId: Number(currentRow.userId),
        name: currentRow.name,
        username: currentRow.username,
        avatarUrl: currentRow.avatarUrl,
        scoreXp: Number(currentRow.scoreXp),
        xpToNextRank: getXpToNextRank(
          Number(currentRow.scoreXp),
          currentRow.nextScoreXp === null ? null : Number(currentRow.nextScoreXp),
        ),
        division: Number(currentRow.division),
        isCurrentUser: true,
      }
    : null;
  const pastStandings = await db
    .select({
      weekStart: xpLeagueStandingsTable.weekStart,
      rank: xpLeagueStandingsTable.rank,
      scoreXp: xpLeagueStandingsTable.scoreXp,
      division: xpLeagueStandingsTable.division,
      movement: xpLeagueStandingsTable.movement,
    })
    .from(xpLeagueStandingsTable)
    .where(and(
      eq(xpLeagueStandingsTable.userId, user.id),
      eq(xpLeagueStandingsTable.category, category),
      lt(xpLeagueStandingsTable.weekStart, week.weekStart),
    ))
    .orderBy(desc(xpLeagueStandingsTable.weekStart))
    .limit(HISTORY_WEEKS);
  const history = buildLeagueHistory(pastStandings, HISTORY_WEEKS);

  res.json(GetMyXpLeagueResponse.parse({
    category,
    optedIn: true,
    effectiveAt: currentMembership.optedInAt.toISOString(),
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    timezone: "UTC",
    division: currentMembership.division,
    currentStanding,
    members,
    page: query.data.page,
    pageSize: query.data.pageSize,
    total,
    hasMore:
      members.length > 0
      && (query.data.page - 1) * query.data.pageSize + members.length < total,
    history,
    rules: RULES,
  }));
});

router.patch("/opt-in", async (req, res): Promise<void> => {
  const body = UpdateMyXpLeagueOptInBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Choose a supported category and whether to join it." });
    return;
  }
  const user = currentUser(req);
  if (!isParticipant(user, res)) return;
  if (!(await ensureLeagueSchema(res))) return;

  const { category } = body.data;
  const now = new Date();
  const result = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"xp-league-membership:" + user.id + ":" + category}, 0))`,
    );
    const [existing] = await transaction
      .select()
      .from(xpLeagueMembershipsTable)
      .where(and(
        eq(xpLeagueMembershipsTable.userId, user.id),
        eq(xpLeagueMembershipsTable.category, category),
      ))
      .limit(1);

    if (body.data.enabled) {
      if (!existing) {
        const [created] = await transaction
          .insert(xpLeagueMembershipsTable)
          .values({ userId: user.id, category, optedInAt: now, division: 1 })
          .returning();
        return created;
      }
      if (existing.optedOutAt) {
        await transaction
          .delete(xpLeagueStandingsTable)
          .where(and(
            eq(xpLeagueStandingsTable.userId, user.id),
            eq(xpLeagueStandingsTable.category, category),
          ));
        const [rejoined] = await transaction
          .update(xpLeagueMembershipsTable)
          .set({
            optedInAt: now,
            optedOutAt: null,
            division: 1,
            updatedAt: now,
          })
          .where(eq(xpLeagueMembershipsTable.id, existing.id))
          .returning();
        return rejoined;
      }
      return existing;
    }

    if (!existing || existing.optedOutAt) return existing ?? {
      category,
      optedOutAt: now,
      division: 1,
      optedInAt: now,
    };
    await transaction
      .delete(xpLeagueStandingsTable)
      .where(and(
        eq(xpLeagueStandingsTable.userId, user.id),
        eq(xpLeagueStandingsTable.category, category),
      ));
    const [left] = await transaction
      .update(xpLeagueMembershipsTable)
      .set({ optedOutAt: now, updatedAt: now })
      .where(eq(xpLeagueMembershipsTable.id, existing.id))
      .returning();
    return left;
  });

  const optedIn = Boolean(result && !result.optedOutAt);
  res.json(UpdateMyXpLeagueOptInResponse.parse({
    category,
    optedIn,
    division: optedIn ? result?.division ?? 1 : null,
    effectiveAt: optedIn ? result?.optedInAt?.toISOString() ?? now.toISOString() : null,
  }));
});

export default router;
