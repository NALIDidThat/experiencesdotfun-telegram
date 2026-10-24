import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  communityContributionsTable,
  communityMembersTable,
  organisationsTable,
  telegramCommunitiesTable,
  telegramCommunityKeywordRulesTable,
  telegramCommunityLinkRulesTable,
  usersTable,
} from "@workspace/db/schema";
import {
  COMMUNITY_XP_CONFIG,
  normalizeCommunityLink,
  normalizeCommunityModerationPhrase,
} from "./community-rules";

export type OwnedTelegramOrganisation = {
  id: number;
  name: string;
  ownerUserId: number;
};

export async function listTelegramOwnedOrganisations(
  telegramUserId: number,
): Promise<OwnedTelegramOrganisation[]> {
  return db
    .select({
      id: organisationsTable.id,
      name: organisationsTable.name,
      ownerUserId: usersTable.id,
    })
    .from(organisationsTable)
    .innerJoin(usersTable, eq(usersTable.id, organisationsTable.ownerUserId))
    .where(
      and(
        eq(usersTable.telegramId, String(telegramUserId)),
        eq(usersTable.userType, "organisation"),
      ),
    )
    .orderBy(asc(organisationsTable.name))
    .limit(20);
}

export async function getTelegramCommunity(chatId: string) {
  const [community] = await db
    .select({
      id: telegramCommunitiesTable.id,
      chatId: telegramCommunitiesTable.chatId,
      chatTitle: telegramCommunitiesTable.chatTitle,
      organisationId: telegramCommunitiesTable.organisationId,
      organisationName: organisationsTable.name,
      spamProtectionEnabled: telegramCommunitiesTable.spamProtectionEnabled,
    })
    .from(telegramCommunitiesTable)
    .innerJoin(
      organisationsTable,
      eq(organisationsTable.id, telegramCommunitiesTable.organisationId),
    )
    .where(eq(telegramCommunitiesTable.chatId, chatId))
    .limit(1);
  return community ?? null;
}

export async function listTelegramOwnedCommunities(
  telegramUserId: number,
  limit = 21,
  offset = 0,
) {
  return db
    .select({
      chatId: telegramCommunitiesTable.chatId,
      chatTitle: telegramCommunitiesTable.chatTitle,
      organisationName: organisationsTable.name,
      spamProtectionEnabled: telegramCommunitiesTable.spamProtectionEnabled,
    })
    .from(telegramCommunitiesTable)
    .innerJoin(
      organisationsTable,
      eq(organisationsTable.id, telegramCommunitiesTable.organisationId),
    )
    .innerJoin(
      usersTable,
      and(
        eq(usersTable.id, organisationsTable.ownerUserId),
        eq(usersTable.telegramId, String(telegramUserId)),
        eq(usersTable.userType, "organisation"),
      ),
    )
    .orderBy(asc(telegramCommunitiesTable.chatTitle), asc(telegramCommunitiesTable.id))
    .limit(Math.max(1, Math.min(101, Math.floor(limit))))
    .offset(Math.max(0, Math.floor(offset)));
}

export async function listTelegramOwnedCommunitiesForManagement(
  telegramUserId: number,
  now = new Date(),
) {
  const communities = await listTelegramOwnedCommunities(telegramUserId, 100, 0);
  if (!communities.length) return [];

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const chatIds = communities.map(({ chatId }) => chatId);
  const [totals, memberStats] = await Promise.all([
    db
      .select({
        chatId: communityContributionsTable.chatId,
        xpAwarded: sql<number>`coalesce(sum(${communityContributionsTable.xpAwarded}), 0)`,
        qualifyingMessages: sql<number>`count(*) filter (where ${communityContributionsTable.contributionType} = 'telegram_message')`,
      })
      .from(communityContributionsTable)
      .where(
        and(
          inArray(communityContributionsTable.chatId, chatIds),
          gte(communityContributionsTable.createdAt, dayStart),
        ),
      )
      .groupBy(communityContributionsTable.chatId),
    db
      .select({
        chatId: communityMembersTable.chatId,
        trackedMembers: count(),
        totalXpAwarded: sql<number>`coalesce(sum(${communityMembersTable.communityXp}), 0)`,
        membersWithXp: sql<number>`count(*) filter (where ${communityMembersTable.communityXp} > 0)`,
        xpEarnersToday: sql<number>`count(*) filter (where ${communityMembersTable.communityXp} > 0 and ${communityMembersTable.lastContributionAt} >= ${dayStart})`,
      })
      .from(communityMembersTable)
      .where(inArray(communityMembersTable.chatId, chatIds))
      .groupBy(communityMembersTable.chatId),
  ]);
  const dailyTotals = new Map(
    totals.map(({ chatId, xpAwarded, qualifyingMessages }) => [
      chatId,
      {
        xpAwarded: Number(xpAwarded),
        qualifyingMessages: Number(qualifyingMessages),
      },
    ]),
  );
  const statsByCommunity = new Map(
    memberStats.map((stats) => [
      stats.chatId,
      {
        trackedMembers: Number(stats.trackedMembers),
        totalXpAwarded: Number(stats.totalXpAwarded),
        membersWithXp: Number(stats.membersWithXp),
        xpEarnersToday: Number(stats.xpEarnersToday),
      },
    ]),
  );

  return communities.map((community) => {
    const todayStats = dailyTotals.get(community.chatId);
    const xpAwardedToday = todayStats?.xpAwarded ?? 0;
    const stats = statsByCommunity.get(community.chatId);
    return {
      ...community,
      xpAwardedToday,
      dailyXpLimit: COMMUNITY_XP_CONFIG.maxDailyXpPerCommunity,
      dailyXpRemaining: Math.max(0, COMMUNITY_XP_CONFIG.maxDailyXpPerCommunity - xpAwardedToday),
      memberXpLimit: COMMUNITY_XP_CONFIG.maxXpPerMember,
      totalXpAwarded: stats?.totalXpAwarded ?? 0,
      membersWithXp: stats?.membersWithXp ?? 0,
      xpEarnersToday: stats?.xpEarnersToday ?? 0,
      trackedMembers: stats?.trackedMembers ?? 0,
      qualifyingMessagesToday: todayStats?.qualifyingMessages ?? 0,
      resetTimezone: "UTC",
    };
  });
}

export async function getTelegramCommunityManagementContext(
  chatId: string,
  telegramUserId: number,
) {
  const [context] = await db
    .select({
      communityId: telegramCommunitiesTable.id,
      chatId: telegramCommunitiesTable.chatId,
      chatTitle: telegramCommunitiesTable.chatTitle,
      organisationId: organisationsTable.id,
      organisationName: organisationsTable.name,
      ownerUserId: usersTable.id,
      spamProtectionEnabled: telegramCommunitiesTable.spamProtectionEnabled,
    })
    .from(telegramCommunitiesTable)
    .innerJoin(
      organisationsTable,
      eq(organisationsTable.id, telegramCommunitiesTable.organisationId),
    )
    .innerJoin(
      usersTable,
      and(
        eq(usersTable.id, organisationsTable.ownerUserId),
        eq(usersTable.telegramId, String(telegramUserId)),
        eq(usersTable.userType, "organisation"),
      ),
    )
    .where(eq(telegramCommunitiesTable.chatId, chatId))
    .limit(1);
  return context ?? null;
}

export async function connectTelegramCommunity(input: {
  chatId: string;
  chatTitle: string;
  organisationId: number;
  telegramUserId: number;
}): Promise<
  | { status: "connected"; organisationName: string }
  | { status: "already_connected"; organisationName: string }
  | { status: "owned_by_another_organisation" }
  | { status: "not_owner" }
> {
  const [owner] = await db
    .select({
      ownerUserId: usersTable.id,
      organisationName: organisationsTable.name,
    })
    .from(organisationsTable)
    .innerJoin(usersTable, eq(usersTable.id, organisationsTable.ownerUserId))
    .where(
      and(
        eq(organisationsTable.id, input.organisationId),
        eq(usersTable.telegramId, String(input.telegramUserId)),
        eq(usersTable.userType, "organisation"),
      ),
    )
    .limit(1);
  if (!owner) return { status: "not_owner" };

  const existing = await getTelegramCommunity(input.chatId);
  if (existing) {
    return existing.organisationId === input.organisationId
      ? { status: "already_connected", organisationName: owner.organisationName }
      : { status: "owned_by_another_organisation" };
  }

  const [inserted] = await db
    .insert(telegramCommunitiesTable)
    .values({
      chatId: input.chatId,
      chatTitle: input.chatTitle.trim() || "Telegram community",
      organisationId: input.organisationId,
      connectedByUserId: owner.ownerUserId,
    })
    .onConflictDoNothing()
    .returning({ id: telegramCommunitiesTable.id });

  if (inserted) {
    return { status: "connected", organisationName: owner.organisationName };
  }

  const racedConnection = await getTelegramCommunity(input.chatId);
  return racedConnection?.organisationId === input.organisationId
    ? { status: "already_connected", organisationName: owner.organisationName }
    : { status: "owned_by_another_organisation" };
}

export async function setTelegramCommunitySpamProtection(input: {
  chatId: string;
  telegramUserId: number;
  enabled: boolean;
}) {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return null;
  const [updated] = await db
    .update(telegramCommunitiesTable)
    .set({
      spamProtectionEnabled: input.enabled,
      updatedAt: new Date(),
    })
    .where(eq(telegramCommunitiesTable.id, context.communityId))
    .returning({ id: telegramCommunitiesTable.id });
  return updated ? { ...context, spamProtectionEnabled: input.enabled } : null;
}

export async function disconnectTelegramCommunity(input: {
  chatId: string;
  telegramUserId: number;
}) {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return null;
  const [removed] = await db
    .delete(telegramCommunitiesTable)
    .where(eq(telegramCommunitiesTable.id, context.communityId))
    .returning({ id: telegramCommunitiesTable.id });
  return removed ? context : null;
}

export async function listTelegramCommunityKeywordRules(
  chatId: string,
  limit = 20,
  offset = 0,
) {
  return db
    .select({
      id: telegramCommunityKeywordRulesTable.id,
      phrase: telegramCommunityKeywordRulesTable.phrase,
      enabled: telegramCommunityKeywordRulesTable.enabled,
      createdAt: telegramCommunityKeywordRulesTable.createdAt,
    })
    .from(telegramCommunityKeywordRulesTable)
    .innerJoin(
      telegramCommunitiesTable,
      eq(telegramCommunitiesTable.id, telegramCommunityKeywordRulesTable.communityId),
    )
    .where(
      and(
        eq(telegramCommunitiesTable.chatId, chatId),
        eq(telegramCommunityKeywordRulesTable.enabled, true),
      ),
    )
    .orderBy(
      asc(telegramCommunityKeywordRulesTable.createdAt),
      asc(telegramCommunityKeywordRulesTable.id),
    )
    .limit(Math.max(1, Math.min(101, Math.floor(limit))))
    .offset(Math.max(0, Math.floor(offset)));
}

export async function addTelegramCommunityKeywordRule(input: {
  chatId: string;
  telegramUserId: number;
  phrase: string;
}): Promise<
  | {
      status: "added";
      ruleId: number;
      rule: { id: number; phrase: string; createdAt: Date };
      context: NonNullable<Awaited<ReturnType<typeof getTelegramCommunityManagementContext>>>;
    }
  | { status: "invalid_phrase" }
  | { status: "already_exists" }
  | { status: "not_owner" }
> {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return { status: "not_owner" };
  const normalizedPhrase = normalizeCommunityModerationPhrase(input.phrase);
  if (!normalizedPhrase) return { status: "invalid_phrase" };

  const [inserted] = await db
    .insert(telegramCommunityKeywordRulesTable)
    .values({
      communityId: context.communityId,
      phrase: input.phrase.trim().replace(/\s+/g, " "),
      normalizedPhrase,
      createdByUserId: context.ownerUserId,
    })
    .onConflictDoNothing()
    .returning({
      id: telegramCommunityKeywordRulesTable.id,
      phrase: telegramCommunityKeywordRulesTable.phrase,
      createdAt: telegramCommunityKeywordRulesTable.createdAt,
    });
  return inserted
    ? { status: "added", ruleId: inserted.id, rule: inserted, context }
    : { status: "already_exists" };
}

export async function removeTelegramCommunityKeywordRule(input: {
  chatId: string;
  telegramUserId: number;
  phrase: string;
}): Promise<
  | {
      status: "removed";
      ruleId: number;
      context: NonNullable<Awaited<ReturnType<typeof getTelegramCommunityManagementContext>>>;
    }
  | { status: "invalid_phrase" }
  | { status: "not_found" }
  | { status: "not_owner" }
> {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return { status: "not_owner" };
  const normalizedPhrase = normalizeCommunityModerationPhrase(input.phrase);
  if (!normalizedPhrase) return { status: "invalid_phrase" };

  const [removed] = await db
    .delete(telegramCommunityKeywordRulesTable)
    .where(
      and(
        eq(telegramCommunityKeywordRulesTable.communityId, context.communityId),
        eq(telegramCommunityKeywordRulesTable.normalizedPhrase, normalizedPhrase),
      ),
    )
    .returning({ id: telegramCommunityKeywordRulesTable.id });
  return removed
    ? { status: "removed", ruleId: removed.id, context }
    : { status: "not_found" };
}

export async function removeTelegramCommunityKeywordRuleById(input: {
  chatId: string;
  telegramUserId: number;
  ruleId: number;
}) {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return { status: "not_owner" as const };
  const [removed] = await db
    .delete(telegramCommunityKeywordRulesTable)
    .where(
      and(
        eq(telegramCommunityKeywordRulesTable.communityId, context.communityId),
        eq(telegramCommunityKeywordRulesTable.id, input.ruleId),
      ),
    )
    .returning({ id: telegramCommunityKeywordRulesTable.id });
  return removed
    ? { status: "removed" as const, ruleId: removed.id, context }
    : { status: "not_found" as const };
}

export async function listTelegramCommunityLinkRules(
  chatId: string,
  limit = 100,
  offset = 0,
) {
  return db
    .select({
      id: telegramCommunityLinkRulesTable.id,
      link: telegramCommunityLinkRulesTable.link,
      normalizedHost: telegramCommunityLinkRulesTable.normalizedHost,
      normalizedPath: telegramCommunityLinkRulesTable.normalizedPath,
      createdAt: telegramCommunityLinkRulesTable.createdAt,
    })
    .from(telegramCommunityLinkRulesTable)
    .innerJoin(
      telegramCommunitiesTable,
      eq(telegramCommunitiesTable.id, telegramCommunityLinkRulesTable.communityId),
    )
    .where(eq(telegramCommunitiesTable.chatId, chatId))
    .orderBy(
      asc(telegramCommunityLinkRulesTable.createdAt),
      asc(telegramCommunityLinkRulesTable.id),
    )
    .limit(Math.max(1, Math.min(101, Math.floor(limit))))
    .offset(Math.max(0, Math.floor(offset)));
}

export async function addTelegramCommunityLinkRule(input: {
  chatId: string;
  telegramUserId: number;
  link: string;
}): Promise<
  | {
      status: "added";
      ruleId: number;
      rule: { id: number; link: string; createdAt: Date };
      context: NonNullable<Awaited<ReturnType<typeof getTelegramCommunityManagementContext>>>;
    }
  | { status: "invalid_link" }
  | { status: "already_exists" }
  | { status: "not_owner" }
> {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return { status: "not_owner" };
  const normalized = normalizeCommunityLink(input.link);
  if (!normalized) return { status: "invalid_link" };

  const [inserted] = await db
    .insert(telegramCommunityLinkRulesTable)
    .values({
      communityId: context.communityId,
      link: normalized.canonicalLink,
      normalizedHost: normalized.normalizedHost,
      normalizedPath: normalized.normalizedPath,
      createdByUserId: context.ownerUserId,
    })
    .onConflictDoNothing()
    .returning({
      id: telegramCommunityLinkRulesTable.id,
      link: telegramCommunityLinkRulesTable.link,
      createdAt: telegramCommunityLinkRulesTable.createdAt,
    });
  return inserted
    ? { status: "added", ruleId: inserted.id, rule: inserted, context }
    : { status: "already_exists" };
}

export async function removeTelegramCommunityLinkRuleById(input: {
  chatId: string;
  telegramUserId: number;
  ruleId: number;
}) {
  const context = await getTelegramCommunityManagementContext(input.chatId, input.telegramUserId);
  if (!context) return { status: "not_owner" as const };
  const [removed] = await db
    .delete(telegramCommunityLinkRulesTable)
    .where(
      and(
        eq(telegramCommunityLinkRulesTable.communityId, context.communityId),
        eq(telegramCommunityLinkRulesTable.id, input.ruleId),
      ),
    )
    .returning({ id: telegramCommunityLinkRulesTable.id });
  return removed
    ? { status: "removed" as const, ruleId: removed.id, context }
    : { status: "not_found" as const };
}
