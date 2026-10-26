import { createHmac } from "node:crypto";
import { and, asc, count, desc, eq, gte, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  communityContributionsTable,
  communityMembersTable,
  usersTable,
  type CommunityMember,
  type User,
} from "@workspace/db/schema";
import { hasSameTelegramIdentity } from "./telegram-identity";
import { logger } from "./logger";
import {
  COMMUNITY_XP_CONFIG,
  decideAdminReward,
  decideMessageAward,
  getCommunityLevel,
  getMessageQualification,
  type CommunityMessageReason,
} from "./community-rules";

const MESSAGE_CONTRIBUTION = "telegram_message";
const ADMIN_REWARD = "admin_reward";

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function lockCommunityXpPool(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  chatId: string,
) {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${chatId}), 0)`,
  );
}

function hashMessage(text: string): string {
  const key = process.env.SESSION_SECRET ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!key) {
    throw new Error("A server secret is required for private community message deduplication.");
  }
  return createHmac("sha256", key).update(text.trim()).digest("hex");
}

export type CommunitySummary = {
  chatId: string;
  title: string;
  communityXp: number;
  contributionCount: number;
  qualifyingMessages: number;
  rank: number;
  level: string;
  levelProgress: number;
  nextLevelXp: number | null;
};

function toSummary(member: CommunityMember, rank: number): CommunitySummary {
  const level = getCommunityLevel(member.communityXp);
  return {
    chatId: member.chatId,
    title: member.chatTitle,
    communityXp: member.communityXp,
    contributionCount: member.contributionCount,
    qualifyingMessages: member.qualifyingMessages,
    rank,
    level: level.label,
    levelProgress: level.progress,
    nextLevelXp: level.nextLevelXp,
  };
}

export async function processCommunityMessage(input: {
  user: User;
  chatId: string;
  chatTitle: string;
  telegramMessageId: string;
  text: string;
  isGroup: boolean;
  isBot: boolean;
  now?: Date;
}): Promise<{ xpAwarded: number; reason: CommunityMessageReason | "already_processed"; wordCount: number }> {
  const qualification = getMessageQualification(input);
  if (!qualification.qualifies) {
    return {
      xpAwarded: 0,
      reason: qualification.reason,
      wordCount: qualification.wordCount,
    };
  }

  const now = input.now ?? new Date();
  const duplicateSince = new Date(
    now.getTime() - COMMUNITY_XP_CONFIG.duplicateWindowSeconds * 1_000,
  );
  const dayStart = utcDayStart(now);
  const messageHash = hashMessage(input.text);

  const result = await db.transaction(async (transaction) => {
    // Serialize awards per group so simultaneous updates cannot overspend the
    // shared daily pool or push a member beyond their lifetime ceiling.
    await lockCommunityXpPool(transaction, input.chatId);

    const [alreadyProcessed] = await transaction
      .select({ id: communityContributionsTable.id })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          eq(communityContributionsTable.telegramMessageId, input.telegramMessageId),
        ),
      )
      .limit(1);
    if (alreadyProcessed) {
      return { xpAwarded: 0, reason: "already_processed" as const };
    }

    const [recentDuplicate] = await transaction
      .select({ id: communityContributionsTable.id })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          eq(communityContributionsTable.userId, input.user.id),
          eq(communityContributionsTable.messageHash, messageHash),
          gte(communityContributionsTable.createdAt, duplicateSince),
        ),
      )
      .limit(1);

    const [recentMessages] = await transaction
      .select({
        total: count(),
      })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          eq(communityContributionsTable.userId, input.user.id),
          eq(communityContributionsTable.contributionType, MESSAGE_CONTRIBUTION),
          gte(communityContributionsTable.wordCount, COMMUNITY_XP_CONFIG.minimumWords),
          gte(
            communityContributionsTable.createdAt,
            new Date(now.getTime() - 60_000),
          ),
        ),
      );

    const [member] = await transaction
      .select({ communityXp: communityMembersTable.communityXp })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.chatId, input.chatId),
          eq(communityMembersTable.userId, input.user.id),
        ),
      )
      .limit(1);

    const [communityDailyXp] = await transaction
      .select({
        total: sql<number>`coalesce(sum(${communityContributionsTable.xpAwarded}), 0)`,
      })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          gte(communityContributionsTable.createdAt, dayStart),
          gt(communityContributionsTable.xpAwarded, 0),
        ),
      );

    const decision = decideMessageAward({
      isDuplicate: Boolean(recentDuplicate),
      qualifyingMessagesInLastMinute: Number(recentMessages?.total ?? 0),
      memberXp: Number(member?.communityXp ?? 0),
      communityXpToday: Number(communityDailyXp?.total ?? 0),
    });

    const [event] = await transaction
      .insert(communityContributionsTable)
      .values({
        userId: input.user.id,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        contributionType: MESSAGE_CONTRIBUTION,
        qualificationReason: decision.reason,
        wordCount: qualification.wordCount,
        xpAwarded: decision.xpAwarded,
        messageHash,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [
          communityContributionsTable.chatId,
          communityContributionsTable.telegramMessageId,
        ],
      })
      .returning({ id: communityContributionsTable.id });

    if (!event) return { xpAwarded: 0, reason: "already_processed" as const };

    if (decision.xpAwarded > 0) {
      await transaction
        .insert(communityMembersTable)
        .values({
          chatId: input.chatId,
          chatTitle: input.chatTitle,
          userId: input.user.id,
          communityXp: decision.xpAwarded,
          contributionCount: 1,
          qualifyingMessages: 1,
          communityXpUpdatedAt: now,
          firstContributionAt: now,
          lastContributionAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [communityMembersTable.chatId, communityMembersTable.userId],
          set: {
            chatTitle: input.chatTitle,
            communityXp: sql`${communityMembersTable.communityXp} + ${decision.xpAwarded}`,
            contributionCount: sql`${communityMembersTable.contributionCount} + 1`,
            qualifyingMessages: sql`${communityMembersTable.qualifyingMessages} + 1`,
            communityXpUpdatedAt: now,
            lastContributionAt: now,
            updatedAt: now,
          },
        });
    }

    return { xpAwarded: decision.xpAwarded, reason: decision.reason };
  });

  if (result.xpAwarded > 0) {
    logger.info(
      {
        chatId: input.chatId,
        userId: input.user.id,
        telegramMessageId: input.telegramMessageId,
        xpAwarded: result.xpAwarded,
      },
      "Community contribution awarded",
    );
  } else {
    logger.info(
      {
        chatId: input.chatId,
        userId: input.user.id,
        telegramMessageId: input.telegramMessageId,
        reason: result.reason,
      },
      "Community contribution not awarded",
    );
  }

  return { ...result, wordCount: qualification.wordCount };
}

export async function processAdminCommunityReward(input: {
  admin: User;
  recipient: User;
  chatId: string;
  chatTitle: string;
  telegramMessageId: string;
  targetMessageId: string;
  targetText?: string;
  amount: number;
  now?: Date;
}): Promise<
  | { awarded: true; xpAwarded: number }
  | {
      awarded: false;
      reason:
        | "self_reward"
        | "already_processed"
        | "invalid_amount"
        | "daily_limit"
        | "member_lifetime_cap"
        | "community_daily_cap"
        | "insufficient_member_xp";
    }
> {
  if (hasSameTelegramIdentity(input.admin, input.recipient)) {
    return { awarded: false, reason: "self_reward" };
  }

  const now = input.now ?? new Date();
  const dayStart = utcDayStart(now);

  return db.transaction(async (transaction) => {
    await lockCommunityXpPool(transaction, input.chatId);

    const [alreadyProcessed] = await transaction
      .select({ id: communityContributionsTable.id })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          eq(communityContributionsTable.telegramMessageId, input.telegramMessageId),
        ),
      )
      .limit(1);
    if (alreadyProcessed) return { awarded: false as const, reason: "already_processed" as const };

    const [adminXp] = await transaction
      .select({
        total: sql<number>`coalesce(sum(abs(${communityContributionsTable.xpAwarded})), 0)`,
      })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          eq(communityContributionsTable.adminUserId, input.admin.id),
          eq(communityContributionsTable.userId, input.recipient.id),
          eq(communityContributionsTable.contributionType, ADMIN_REWARD),
          gte(communityContributionsTable.createdAt, dayStart),
        ),
      );

    const [recipient] = await transaction
      .select({ communityXp: communityMembersTable.communityXp })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.chatId, input.chatId),
          eq(communityMembersTable.userId, input.recipient.id),
        ),
      )
      .limit(1);

    const [communityDailyXp] = await transaction
      .select({
        total: sql<number>`coalesce(sum(${communityContributionsTable.xpAwarded}), 0)`,
      })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, input.chatId),
          gte(communityContributionsTable.createdAt, dayStart),
          gt(communityContributionsTable.xpAwarded, 0),
        ),
      );

    const decision = decideAdminReward({
      amount: input.amount,
      adminXpToday: Number(adminXp?.total ?? 0),
      recipientLifetimeXp: Number(recipient?.communityXp ?? 0),
      communityXpToday: Number(communityDailyXp?.total ?? 0),
    });
    if (!decision.allowed) {
      return {
        awarded: false as const,
        reason: decision.reason === "per_admin_daily_limit" ? "daily_limit" : decision.reason,
      };
    }

    const [event] = await transaction
      .insert(communityContributionsTable)
      .values({
        userId: input.recipient.id,
        adminUserId: input.admin.id,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        targetMessageId: input.targetMessageId,
        contributionType: ADMIN_REWARD,
        qualificationReason: input.amount > 0 ? "admin_recognition" : "admin_demotion",
        wordCount: input.targetText
          ? input.targetText.trim().split(/\s+/).filter(Boolean).length
          : 0,
        xpAwarded: input.amount,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [
          communityContributionsTable.chatId,
          communityContributionsTable.telegramMessageId,
        ],
      })
      .returning({ id: communityContributionsTable.id });

    if (!event) return { awarded: false as const, reason: "already_processed" as const };

    await transaction
      .insert(communityMembersTable)
      .values({
        chatId: input.chatId,
        chatTitle: input.chatTitle,
        userId: input.recipient.id,
        communityXp: input.amount,
        contributionCount: input.amount > 0 ? 1 : 0,
        qualifyingMessages: 0,
        communityXpUpdatedAt: now,
        firstContributionAt: now,
        lastContributionAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communityMembersTable.chatId, communityMembersTable.userId],
        set: {
          chatTitle: input.chatTitle,
          communityXp: sql`${communityMembersTable.communityXp} + ${input.amount}`,
          communityXpUpdatedAt: now,
          updatedAt: now,
          ...(input.amount > 0
            ? {
                contributionCount: sql`${communityMembersTable.contributionCount} + 1`,
                lastContributionAt: now,
              }
            : {}),
        },
      });

    return { awarded: true as const, xpAwarded: input.amount };
  });
}

export async function getCommunityRank(chatId: string, userId: number): Promise<number | null> {
  const [member] = await db
    .select()
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.chatId, chatId),
        eq(communityMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return null;

  const ahead = or(
    gt(communityMembersTable.communityXp, member.communityXp),
    and(
      eq(communityMembersTable.communityXp, member.communityXp),
      gt(communityMembersTable.contributionCount, member.contributionCount),
    ),
    and(
      eq(communityMembersTable.communityXp, member.communityXp),
      eq(communityMembersTable.contributionCount, member.contributionCount),
      lt(communityMembersTable.communityXpUpdatedAt, member.communityXpUpdatedAt),
    ),
    and(
      eq(communityMembersTable.communityXp, member.communityXp),
      eq(communityMembersTable.contributionCount, member.contributionCount),
      eq(communityMembersTable.communityXpUpdatedAt, member.communityXpUpdatedAt),
      lt(communityMembersTable.userId, member.userId),
    ),
  );
  const [position] = await db
    .select({ ahead: count() })
    .from(communityMembersTable)
    .where(and(eq(communityMembersTable.chatId, chatId), ahead));
  return Number(position?.ahead ?? 0) + 1;
}

export async function getCommunityLeaderboard(
  chatId: string,
  currentUserId?: number,
  limit = COMMUNITY_XP_CONFIG.leaderboardSize,
) {
  const rows = await db
    .select({
      userId: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      communityXp: communityMembersTable.communityXp,
      contributionCount: communityMembersTable.contributionCount,
      qualifyingMessages: communityMembersTable.qualifyingMessages,
      communityXpUpdatedAt: communityMembersTable.communityXpUpdatedAt,
    })
    .from(communityMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, communityMembersTable.userId))
    .where(eq(communityMembersTable.chatId, chatId))
    .orderBy(
      desc(communityMembersTable.communityXp),
      desc(communityMembersTable.contributionCount),
      asc(communityMembersTable.communityXpUpdatedAt),
      asc(communityMembersTable.userId),
    )
    .limit(Math.max(1, Math.min(limit, 50)));

  return rows.map((member, index) => ({
    rank: index + 1,
    name: member.name,
    username: member.username,
    communityXp: member.communityXp,
    qualifyingMessages: member.qualifyingMessages,
    level: getCommunityLevel(member.communityXp).label,
    isCurrentUser: member.userId === currentUserId,
  }));
}

export async function getMyCommunities(userId: number): Promise<CommunitySummary[]> {
  const memberships = await db
    .select()
    .from(communityMembersTable)
    .where(eq(communityMembersTable.userId, userId))
    .orderBy(desc(communityMembersTable.communityXp), asc(communityMembersTable.chatTitle));

  return Promise.all(
    memberships.map(async (member) => {
      const rank = await getCommunityRank(member.chatId, userId);
      return toSummary(member, rank ?? 1);
    }),
  );
}

export async function getCommunityMemberSummary(
  chatId: string,
  userId: number,
): Promise<CommunitySummary | null> {
  const [member] = await db
    .select()
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.chatId, chatId),
        eq(communityMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return null;
  const rank = await getCommunityRank(chatId, userId);
  return toSummary(member, rank ?? 1);
}

export async function getCommunityDetails(chatId: string, userId: number) {
  const [member] = await db
    .select()
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.chatId, chatId),
        eq(communityMembersTable.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return null;

  const [rank, leaderboard, recentContributions] = await Promise.all([
    getCommunityRank(chatId, userId),
    getCommunityLeaderboard(chatId, userId),
    db
      .select({
        id: communityContributionsTable.id,
        contributionType: communityContributionsTable.contributionType,
        xpAwarded: communityContributionsTable.xpAwarded,
        createdAt: communityContributionsTable.createdAt,
      })
      .from(communityContributionsTable)
      .where(
        and(
          eq(communityContributionsTable.chatId, chatId),
          eq(communityContributionsTable.userId, userId),
          gt(communityContributionsTable.xpAwarded, 0),
        ),
      )
      .orderBy(desc(communityContributionsTable.createdAt))
      .limit(COMMUNITY_XP_CONFIG.recentContributionLimit),
  ]);

  return {
    community: toSummary(member, rank ?? 1),
    leaderboard,
    recentContributions: recentContributions.map((contribution) => ({
      ...contribution,
      createdAt: contribution.createdAt.toISOString(),
    })),
  };
}

export async function getCommunityMemberByUsername(
  chatId: string,
  username: string,
): Promise<{ user: User; community: CommunitySummary } | null> {
  const normalized = username.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/.test(normalized)) return null;

  const [member] = await db
    .select({ member: communityMembersTable, user: usersTable })
    .from(communityMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, communityMembersTable.userId))
    .where(
      and(
        eq(communityMembersTable.chatId, chatId),
        sql`lower(${usersTable.username}) = ${normalized}`,
      ),
    )
    .limit(1);
  if (!member) return null;

  const rank = await getCommunityRank(chatId, member.user.id);
  return { user: member.user, community: toSummary(member.member, rank ?? 1) };
}