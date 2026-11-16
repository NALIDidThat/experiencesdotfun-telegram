import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  telegramCommunityMemberDailyActivityTable,
  telegramCommunityMemberStatsTable,
  telegramCommunitiesTable,
} from "@workspace/db/schema";
import { logger } from "./logger";
import { isNewTelegramCommunityMessageId } from "./telegram-community-message-policy";

const STATS_TABLE_RETRY_MS = 60_000;
let statsTableAvailable = false;
let statsTableUnavailableUntil = 0;
let missingTableWarningLogged = false;

export class CommunityMemberStatsMigrationRequiredError extends Error {
  constructor() {
    super("Community member tracking is waiting for its database migration.");
    this.name = "CommunityMemberStatsMigrationRequiredError";
  }
}

function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

async function ensureStatsTable(): Promise<void> {
  if (statsTableAvailable) return;
  if (Date.now() < statsTableUnavailableUntil) {
    throw new CommunityMemberStatsMigrationRequiredError();
  }

  try {
    await db
      .select({ id: telegramCommunityMemberStatsTable.id })
      .from(telegramCommunityMemberStatsTable)
      .limit(0);
    await db
      .select({ id: telegramCommunityMemberDailyActivityTable.id })
      .from(telegramCommunityMemberDailyActivityTable)
      .limit(0);
    statsTableAvailable = true;
    statsTableUnavailableUntil = 0;
    missingTableWarningLogged = false;
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    statsTableUnavailableUntil = Date.now() + STATS_TABLE_RETRY_MS;
    if (!missingTableWarningLogged) {
      logger.warn(
        "Telegram community member stats table is missing; apply its migration to enable tracking.",
      );
      missingTableWarningLogged = true;
    }
    throw new CommunityMemberStatsMigrationRequiredError();
  }
}

async function withStatsTable<T>(operation: () => Promise<T>): Promise<T> {
  await ensureStatsTable();
  try {
    return await operation();
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    statsTableAvailable = false;
    statsTableUnavailableUntil = Date.now() + STATS_TABLE_RETRY_MS;
    if (!missingTableWarningLogged) {
      logger.warn(
        "Telegram community member stats table is missing; apply its migration to enable tracking.",
      );
      missingTableWarningLogged = true;
    }
    throw new CommunityMemberStatsMigrationRequiredError();
  }
}

async function lockMemberStats(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  chatId: string,
  telegramUserId: string,
) {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${chatId}), hashtext(${telegramUserId}))`,
  );
}

export async function recordTelegramCommunityMemberJoin(input: {
  chatId: string;
  telegramUserId: string;
  name: string;
  username: string | null;
  joinedAt: Date;
}): Promise<void> {
  await withStatsTable(() =>
    db.transaction(async (transaction) => {
      await lockMemberStats(transaction, input.chatId, input.telegramUserId);
      const [existing] = await transaction
        .select({ id: telegramCommunityMemberStatsTable.id })
        .from(telegramCommunityMemberStatsTable)
        .where(
          and(
            eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
            eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
          ),
        )
        .limit(1);

      if (existing) {
        await transaction
          .update(telegramCommunityMemberStatsTable)
          .set({
            name: input.name,
            username: input.username,
            telegramJoinedAt: input.joinedAt,
            telegramLeftAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
              eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
            ),
          );
        return;
      }

      await transaction.insert(telegramCommunityMemberStatsTable).values({
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        name: input.name,
        username: input.username,
        telegramJoinedAt: input.joinedAt,
        telegramLeftAt: null,
      });
    }),
  );
}

export async function recordTelegramCommunityMemberLeave(input: {
  chatId: string;
  telegramUserId: string;
  leftAt: Date;
}): Promise<void> {
  await withStatsTable(() =>
    db.transaction(async (transaction) => {
      await lockMemberStats(transaction, input.chatId, input.telegramUserId);
      await transaction
        .update(telegramCommunityMemberStatsTable)
        .set({ telegramLeftAt: input.leftAt, updatedAt: new Date() })
        .where(
          and(
            eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
            eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
          ),
        );
    }),
  );
}

export async function recordTelegramCommunityMemberMessage(input: {
  chatId: string;
  telegramUserId: string;
  name: string;
  username: string | null;
  telegramMessageId: number;
  qualifies: boolean;
  messageDate: Date;
}): Promise<void> {
  await withStatsTable(() =>
    db.transaction(async (transaction) => {
      await lockMemberStats(transaction, input.chatId, input.telegramUserId);
      const [existing] = await transaction
        .select({
          messageCount: telegramCommunityMemberStatsTable.messageCount,
          lastMessageId: telegramCommunityMemberStatsTable.lastMessageId,
        })
        .from(telegramCommunityMemberStatsTable)
        .where(
          and(
            eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
            eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
          ),
        )
        .limit(1);

      if (!existing) {
        await transaction.insert(telegramCommunityMemberStatsTable).values({
          chatId: input.chatId,
          telegramUserId: input.telegramUserId,
          name: input.name,
          username: input.username,
          messageCount: 1,
          qualifyingMessageCount: input.qualifies ? 1 : 0,
          lastMessageId: input.telegramMessageId,
          lastQualifyingMessageAt: input.qualifies ? input.messageDate : null,
        });
      } else if (
        // Telegram delivers updates in order and message IDs increase within a
        // chat. This makes retries idempotent without retaining message text.
        !isNewTelegramCommunityMessageId(
          existing.lastMessageId,
          input.telegramMessageId,
        )
      ) {
        return;
      } else {
        await transaction
          .update(telegramCommunityMemberStatsTable)
          .set({
            name: input.name,
            username: input.username,
            messageCount: sql`${telegramCommunityMemberStatsTable.messageCount} + 1`,
            lastMessageId: input.telegramMessageId,
            updatedAt: new Date(),
            ...(input.qualifies
              ? {
                  qualifyingMessageCount: sql`${telegramCommunityMemberStatsTable.qualifyingMessageCount} + 1`,
                  lastQualifyingMessageAt: input.messageDate,
                }
              : {}),
          })
          .where(
            and(
              eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
              eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
            ),
          );
      }

      if (input.qualifies) {
        const activityDate = input.messageDate.toISOString().slice(0, 10);
        await transaction
          .insert(telegramCommunityMemberDailyActivityTable)
          .values({
            chatId: input.chatId,
            telegramUserId: input.telegramUserId,
            activityDate,
            qualifyingMessageCount: 1,
          })
          .onConflictDoUpdate({
            target: [
              telegramCommunityMemberDailyActivityTable.chatId,
              telegramCommunityMemberDailyActivityTable.telegramUserId,
              telegramCommunityMemberDailyActivityTable.activityDate,
            ],
            set: {
              qualifyingMessageCount: sql`${telegramCommunityMemberDailyActivityTable.qualifyingMessageCount} + 1`,
              updatedAt: new Date(),
            },
          });
      }
    }),
  );
}

export async function listTelegramCommunityMembers(input: {
  chatId: string;
  search: string;
  limit: number;
  offset: number;
}) {
  return withStatsTable(async () => {
    const conditions = [eq(telegramCommunityMemberStatsTable.chatId, input.chatId)];
    if (input.search) {
      const search = `%${input.search}%`;
      conditions.push(
        or(
          ilike(telegramCommunityMemberStatsTable.name, search),
          ilike(telegramCommunityMemberStatsTable.username, search),
          eq(telegramCommunityMemberStatsTable.telegramUserId, input.search),
        )!,
      );
    }
    const [members, [total]] = await Promise.all([
      db
      .select({
        id: telegramCommunityMemberStatsTable.id,
        name: telegramCommunityMemberStatsTable.name,
        username: telegramCommunityMemberStatsTable.username,
        qualifyingMessageCount: telegramCommunityMemberStatsTable.qualifyingMessageCount,
        joinedAt: telegramCommunityMemberStatsTable.telegramJoinedAt,
        leftAt: telegramCommunityMemberStatsTable.telegramLeftAt,
        firstObservedAt: telegramCommunityMemberStatsTable.firstObservedAt,
        lastQualifyingMessageAt: telegramCommunityMemberStatsTable.lastQualifyingMessageAt,
      })
      .from(telegramCommunityMemberStatsTable)
      .where(and(...conditions))
      .orderBy(
        desc(telegramCommunityMemberStatsTable.qualifyingMessageCount),
        asc(telegramCommunityMemberStatsTable.id),
      )
      .limit(input.limit)
      .offset(input.offset),
      db
        .select({ total: count() })
        .from(telegramCommunityMemberStatsTable)
        .where(and(...conditions)),
    ]);

    const [community] = await db
      .select({ trackingStartedAt: telegramCommunitiesTable.createdAt })
      .from(telegramCommunitiesTable)
      .where(eq(telegramCommunitiesTable.chatId, input.chatId))
      .limit(1);

    return {
      members: members.map((member) => ({
        ...member,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        leftAt: member.leftAt?.toISOString() ?? null,
        firstObservedAt: member.firstObservedAt.toISOString(),
        lastQualifyingMessageAt: member.lastQualifyingMessageAt?.toISOString() ?? null,
      })),
      total: Number(total?.total ?? 0),
      trackingStartedAt: community?.trackingStartedAt.toISOString() ?? null,
      limit: input.limit,
      offset: input.offset,
    };
  });
}

export async function getTelegramCommunityDailyInsights(input: {
  chatId: string;
  days: number;
  now?: Date;
}) {
  return withStatsTable(async () => {
    const now = input.now ?? new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - input.days + 1))
      .toISOString()
      .slice(0, 10);
    const [rows, [community]] = await Promise.all([
      db
        .select({
          date: telegramCommunityMemberDailyActivityTable.activityDate,
          qualifyingMessageCount: sql<number>`sum(${telegramCommunityMemberDailyActivityTable.qualifyingMessageCount})`,
          activeMembers: sql<number>`count(distinct ${telegramCommunityMemberDailyActivityTable.telegramUserId})`,
        })
        .from(telegramCommunityMemberDailyActivityTable)
        .where(and(
          eq(telegramCommunityMemberDailyActivityTable.chatId, input.chatId),
          gte(telegramCommunityMemberDailyActivityTable.activityDate, firstDay),
        ))
        .groupBy(telegramCommunityMemberDailyActivityTable.activityDate)
        .orderBy(asc(telegramCommunityMemberDailyActivityTable.activityDate)),
      db
        .select({ trackingStartedAt: telegramCommunitiesTable.createdAt })
        .from(telegramCommunitiesTable)
        .where(eq(telegramCommunitiesTable.chatId, input.chatId))
        .limit(1),
    ]);
    const activityByDate = new Map(rows.map((row) => [row.date, {
      qualifyingMessageCount: Number(row.qualifyingMessageCount),
      activeMembers: Number(row.activeMembers),
    }]));
    const trackingStartDate = community?.trackingStartedAt.toISOString().slice(0, 10);
    const effectiveFirstDay = trackingStartDate && trackingStartDate > firstDay
      ? trackingStartDate
      : firstDay;
    const days: Array<{
      date: string;
      qualifyingMessageCount: number;
      activeMembers: number;
    }> = [];
    for (
      let day = new Date(`${effectiveFirstDay}T00:00:00.000Z`);
      day <= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = day.toISOString().slice(0, 10);
      const activity = activityByDate.get(date);
      days.push({
        date,
        qualifyingMessageCount: activity?.qualifyingMessageCount ?? 0,
        activeMembers: activity?.activeMembers ?? 0,
      });
    }
    return {
      days,
      trackingStartedAt: community?.trackingStartedAt.toISOString() ?? null,
      daysRequested: input.days,
    };
  });
}

export async function getTelegramCommunityMemberHistory(input: {
  chatId: string;
  memberId: number;
  days: number;
  now?: Date;
}) {
  return withStatsTable(async () => {
    const now = input.now ?? new Date();
    const [member] = await db
      .select({
        telegramUserId: telegramCommunityMemberStatsTable.telegramUserId,
        firstObservedAt: telegramCommunityMemberStatsTable.firstObservedAt,
      })
      .from(telegramCommunityMemberStatsTable)
      .where(and(
        eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
        eq(telegramCommunityMemberStatsTable.id, input.memberId),
      ))
      .limit(1);
    if (!member) return null;

    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - input.days + 1))
      .toISOString()
      .slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const firstObservedDate = member.firstObservedAt.toISOString().slice(0, 10);
    const effectiveFirstDay = firstObservedDate > firstDay ? firstObservedDate : firstDay;
    const [rows, [community]] = await Promise.all([
      db
        .select({
          date: telegramCommunityMemberDailyActivityTable.activityDate,
          qualifyingMessageCount: telegramCommunityMemberDailyActivityTable.qualifyingMessageCount,
        })
        .from(telegramCommunityMemberDailyActivityTable)
        .where(and(
          eq(telegramCommunityMemberDailyActivityTable.chatId, input.chatId),
          eq(telegramCommunityMemberDailyActivityTable.telegramUserId, member.telegramUserId),
          gte(telegramCommunityMemberDailyActivityTable.activityDate, effectiveFirstDay),
          lte(telegramCommunityMemberDailyActivityTable.activityDate, today),
        ))
        .orderBy(asc(telegramCommunityMemberDailyActivityTable.activityDate)),
      db
        .select({ trackingStartedAt: telegramCommunitiesTable.createdAt })
        .from(telegramCommunitiesTable)
        .where(eq(telegramCommunitiesTable.chatId, input.chatId))
        .limit(1),
    ]);
    const activityByDate = new Map(rows.map((row) => [row.date, Number(row.qualifyingMessageCount)]));
    const days: Array<{ date: string; qualifyingMessageCount: number }> = [];
    for (
      let day = new Date(`${effectiveFirstDay}T00:00:00.000Z`);
      day <= new Date(`${today}T00:00:00.000Z`);
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = day.toISOString().slice(0, 10);
      days.push({
        date,
        qualifyingMessageCount: activityByDate.get(date) ?? 0,
      });
    }
    return {
      memberId: input.memberId,
      days,
      trackingStartedAt: community?.trackingStartedAt.toISOString() ?? null,
      daysRequested: input.days,
    };
  });
}
