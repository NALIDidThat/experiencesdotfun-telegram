import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  organisationsTable,
  telegramCommunitiesTable,
  telegramCommunityKeywordRulesTable,
  usersTable,
} from "@workspace/db/schema";
import { normalizeCommunityModerationPhrase } from "./community-rules";

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

export async function listTelegramCommunityKeywordRules(chatId: string, limit = 20) {
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
    .orderBy(asc(telegramCommunityKeywordRulesTable.createdAt))
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
}

export async function addTelegramCommunityKeywordRule(input: {
  chatId: string;
  telegramUserId: number;
  phrase: string;
}): Promise<
  | {
      status: "added";
      ruleId: number;
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
    .returning({ id: telegramCommunityKeywordRulesTable.id });
  return inserted
    ? { status: "added", ruleId: inserted.id, context }
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
