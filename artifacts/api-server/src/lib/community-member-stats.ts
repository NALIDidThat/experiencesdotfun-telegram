import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  telegramCommunityMemberStatsTable,
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
          lastMessageId: input.telegramMessageId,
        });
        return;
      }

      // Telegram delivers updates in order and message IDs increase within a
      // chat. This makes retries idempotent without retaining every message.
      if (
        !isNewTelegramCommunityMessageId(
          existing.lastMessageId,
          input.telegramMessageId,
        )
      ) {
        return;
      }

      await transaction
        .update(telegramCommunityMemberStatsTable)
        .set({
          name: input.name,
          username: input.username,
          messageCount: sql`${telegramCommunityMemberStatsTable.messageCount} + 1`,
          lastMessageId: input.telegramMessageId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(telegramCommunityMemberStatsTable.chatId, input.chatId),
            eq(telegramCommunityMemberStatsTable.telegramUserId, input.telegramUserId),
          ),
        );
    }),
  );
}

export async function listTelegramCommunityTopMembers(chatId: string) {
  return withStatsTable(async () => {
    const members = await db
      .select({
        id: telegramCommunityMemberStatsTable.id,
        name: telegramCommunityMemberStatsTable.name,
        username: telegramCommunityMemberStatsTable.username,
        messageCount: telegramCommunityMemberStatsTable.messageCount,
        joinedAt: telegramCommunityMemberStatsTable.telegramJoinedAt,
      })
      .from(telegramCommunityMemberStatsTable)
      .where(
        and(
          eq(telegramCommunityMemberStatsTable.chatId, chatId),
          isNull(telegramCommunityMemberStatsTable.telegramLeftAt),
        ),
      )
      .orderBy(
        desc(telegramCommunityMemberStatsTable.messageCount),
        asc(telegramCommunityMemberStatsTable.id),
      )
      .limit(20);

    return members.map((member) => ({
      ...member,
      joinedAt: member.joinedAt?.toISOString() ?? null,
    }));
  });
}
