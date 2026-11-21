import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddMyCommunityBody,
  AddTelegramCommunityLinkBody,
  AddTelegramCommunityLinkParams,
  AddTelegramCommunityLinkResponse,
  AddTelegramCommunityPhraseBody,
  AddTelegramCommunityPhraseParams,
  AddTelegramCommunityPhraseResponse,
  DeleteTelegramCommunityLinkParams,
  DeleteTelegramCommunityPhraseParams,
  GetTelegramCommunityRulesParams,
  GetTelegramCommunityRulesResponse,
  GetTelegramCommunityMembersQueryParams,
  GetTelegramCommunityMembersResponse,
  GetTelegramCommunityInsightsQueryParams,
  GetTelegramCommunityInsightsResponse,
  GetTelegramCommunityMemberHistoryQueryParams,
  GetTelegramCommunityMemberHistoryResponse,
  GetTelegramCommunityModerationEventsQueryParams,
  GetTelegramCommunityModerationEventsResponse,
  GetTelegramCommunityManagementAuditQueryParams,
  GetTelegramCommunityManagementAuditResponse,
  PreviewTelegramCommunityRulesBody,
  PreviewTelegramCommunityRulesParams,
  PreviewTelegramCommunityRulesResponse,
  UpdateTelegramCommunityRiddleSettingsBody,
  UpdateTelegramCommunityRiddleSettingsParams,
  UpdateTelegramCommunityRiddleSettingsResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { communityMembersTable } from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  getCommunityDetails,
  getCommunityMemberSummary,
  getCommunityRanksForUser,
  getMyCommunities,
} from "../lib/contribution";
import {
  getTelegramCommunityOpenUrl,
  getTelegramCommunityLiveInfo,
  verifyTelegramCommunityMembership,
} from "../lib/telegram";
import {
  CommunityMemberStatsMigrationRequiredError,
  getTelegramCommunityDailyInsights,
  getTelegramCommunityMemberHistory,
  listActiveTelegramCommunityStats,
  listTelegramCommunityMembers,
} from "../lib/community-member-stats";
import {
  addTelegramCommunityKeywordRule,
  addTelegramCommunityLinkRule,
  getTelegramCommunityManagementContext,
  listTelegramCommunityManagementAudit,
  listTelegramCommunityModerationEvents,
  listTelegramCommunityKeywordRules,
  listTelegramCommunityLinkRules,
  listTelegramOwnedCommunitiesForManagement,
  recordTelegramCommunityModerationEvent,
  removeTelegramCommunityKeywordRuleById,
  removeTelegramCommunityLinkRuleById,
  setTelegramCommunityRiddleSettings,
} from "../lib/community-moderation";
import {
  extractCommunityMessageLinks,
  isCommunityLinkWhitelisted,
  matchesCommunityModerationPhrase,
} from "../lib/community-rules";

const router: IRouter = Router();
router.use(requireTelegramUser);

function getOrganisationTelegramUserId(req: Request, res: Response): number | null {
  const user = currentUser(req);
  if (user.userType !== "organisation") {
    res.status(403).json({ message: "Organisation accounts can manage linked Telegram groups." });
    return null;
  }
  const telegramUserId = Number(user.telegramId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    res.status(400).json({ message: "This organisation profile needs a linked Telegram identity." });
    return null;
  }
  return telegramUserId;
}

router.get("/community/me", async (req, res) => {
  const user = currentUser(req);
  res.json({ communities: await getMyCommunities(user.id) });
});

router.get("/community/me/telegram", async (req, res) => {
  const user = currentUser(req);
  if (user.userType !== "participant") {
    res.status(403).json({ message: "Telegram participation summaries are for participant accounts." });
    return;
  }

  const telegramUserId = String(user.telegramId ?? "").trim();
  if (!/^[1-9]\d{0,19}$/.test(telegramUserId)) {
    res.status(400).json({
      message: "This participant profile needs a linked Telegram identity to show community activity.",
    });
    return;
  }

  try {
    const trackedCommunities = await listActiveTelegramCommunityStats(telegramUserId);
    const ranks = await getCommunityRanksForUser(
      trackedCommunities.map((community) => community.chatId),
      user.id,
    );
    const communities = await Promise.all(
      trackedCommunities.map(async (community) => ({
        chatId: community.chatId,
        title: community.title,
        messageCount: community.messageCount,
        qualifyingMessageCount: community.qualifyingMessageCount,
        rank: ranks.get(community.chatId) ?? null,
        joinedAt: community.joinedAt?.toISOString() ?? null,
        trackingStartedAt: community.trackingStartedAt.toISOString(),
        openUrl: await getTelegramCommunityOpenUrl(community.chatId),
      })),
    );
    res.json({ communities });
  } catch (error) {
    if (error instanceof CommunityMemberStatsMigrationRequiredError) {
      res.status(503).json({
        message: "Telegram participation tracking is not available until its database migration is applied.",
      });
      return;
    }
    throw error;
  }
});

router.get("/community/manage", async (req, res) => {
  const user = currentUser(req);
  if (user.userType !== "organisation") {
    res.status(403).json({ message: "Organisation accounts can manage linked Telegram groups." });
    return;
  }
  const telegramUserId = Number(user.telegramId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    res.status(400).json({ message: "This organisation profile needs a linked Telegram identity." });
    return;
  }
  res.json({
    communities: await listTelegramOwnedCommunitiesForManagement(telegramUserId),
  });
});

router.patch("/community/manage/:chatId/riddles", async (req, res) => {
  const params = UpdateTelegramCommunityRiddleSettingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group identifier is invalid." });
    return;
  }
  const body = UpdateTelegramCommunityRiddleSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Choose a valid interval and turn automatic riddles on or off." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const updated = await setTelegramCommunityRiddleSettings({
    chatId: params.data.chatId,
    telegramUserId,
    enabled: body.data.enabled,
    intervalMinutes: body.data.intervalMinutes,
  });
  if (!updated) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  res.json(UpdateTelegramCommunityRiddleSettingsResponse.parse({
    enabled: updated.riddlesEnabled,
    intervalMinutes: updated.riddleIntervalMinutes,
  }));
});

router.get("/community/manage/:chatId/rules", async (req, res) => {
  const params = GetTelegramCommunityRulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group identifier is invalid." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const context = await getTelegramCommunityManagementContext(params.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  const [phraseRules, linkRules] = await Promise.all([
    listTelegramCommunityKeywordRules(params.data.chatId, 100),
    listTelegramCommunityLinkRules(params.data.chatId, 100),
  ]);
  res.json(GetTelegramCommunityRulesResponse.parse({ phraseRules, linkRules }));
});

router.post("/community/manage/:chatId/rules/phrases", async (req, res) => {
  const params = AddTelegramCommunityPhraseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group identifier is invalid." });
    return;
  }
  const body = AddTelegramCommunityPhraseBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Enter a banned phrase between 2 and 80 characters." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const result = await addTelegramCommunityKeywordRule({
    chatId: params.data.chatId,
    telegramUserId,
    phrase: body.data.phrase,
  });
  if (result.status === "not_owner") {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  if (result.status === "invalid_phrase") {
    res.status(400).json({ message: "Enter a valid banned phrase between 2 and 80 characters." });
    return;
  }
  if (result.status === "already_exists") {
    res.status(409).json({ message: "That banned phrase is already saved." });
    return;
  }
  res.status(201).json(AddTelegramCommunityPhraseResponse.parse(result.rule));
});

router.delete("/community/manage/:chatId/rules/phrases/:ruleId", async (req, res) => {
  const params = DeleteTelegramCommunityPhraseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group or rule identifier is invalid." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const result = await removeTelegramCommunityKeywordRuleById({
    chatId: params.data.chatId,
    telegramUserId,
    ruleId: params.data.ruleId,
  });
  if (result.status !== "removed") {
    res.status(404).json({ message: "That banned phrase could not be found for this group." });
    return;
  }
  res.status(204).send();
});

router.post("/community/manage/:chatId/rules/links", async (req, res) => {
  const params = AddTelegramCommunityLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group identifier is invalid." });
    return;
  }
  const body = AddTelegramCommunityLinkBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Enter a URL or domain to whitelist." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const result = await addTelegramCommunityLinkRule({
    chatId: params.data.chatId,
    telegramUserId,
    link: body.data.link,
  });
  if (result.status === "not_owner") {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  if (result.status === "invalid_link") {
    res.status(400).json({ message: "Enter a valid http or https URL or domain." });
    return;
  }
  if (result.status === "already_exists") {
    res.status(409).json({ message: "That link is already whitelisted." });
    return;
  }
  res.status(201).json(AddTelegramCommunityLinkResponse.parse(result.rule));
});

router.delete("/community/manage/:chatId/rules/links/:ruleId", async (req, res) => {
  const params = DeleteTelegramCommunityLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: "That Telegram group or rule identifier is invalid." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const result = await removeTelegramCommunityLinkRuleById({
    chatId: params.data.chatId,
    telegramUserId,
    ruleId: params.data.ruleId,
  });
  if (result.status !== "removed") {
    res.status(404).json({ message: "That whitelisted link could not be found for this group." });
    return;
  }
  res.status(204).send();
});

router.get("/community/manage/:chatId/live-info", async (req, res) => {
  const chatId = String(req.params.chatId);
  if (!/^-?\d{1,20}$/.test(chatId) || Number(chatId) >= 0) {
    res.status(400).json({ message: "That Telegram group identifier is invalid." });
    return;
  }

  const user = currentUser(req);
  if (user.userType !== "organisation") {
    res.status(403).json({ message: "Organisation accounts can manage linked Telegram groups." });
    return;
  }
  const telegramUserId = Number(user.telegramId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    res.status(400).json({ message: "This organisation profile needs a linked Telegram identity." });
    return;
  }

  const context = await getTelegramCommunityManagementContext(chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }

  res.json(await getTelegramCommunityLiveInfo(chatId));
});

function isMissingManagementTable(error: unknown): boolean {
  const cause = typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : error;
  return typeof cause === "object" && cause !== null && "code" in cause
    && String(cause.code) === "42P01";
}

router.get("/community/manage/members", async (req, res) => {
  const query = GetTelegramCommunityMembersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Check the group, search text, and member-list page." });
    return;
  }

  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;

  const context = await getTelegramCommunityManagementContext(query.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }

  try {
    const result = await listTelegramCommunityMembers({
      chatId: query.data.chatId,
      search: query.data.search?.trim() ?? "",
      limit: query.data.limit,
      offset: query.data.offset,
    });
    res.json(GetTelegramCommunityMembersResponse.parse(result));
  } catch (error) {
    if (error instanceof CommunityMemberStatsMigrationRequiredError) {
      res.status(503).json({
        message: "Member activity tracking is waiting for its database migration.",
      });
      return;
    }
    throw error;
  }
});

router.get("/community/manage/insights", async (req, res) => {
  const query = GetTelegramCommunityInsightsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Choose a valid group and activity period." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;
  const context = await getTelegramCommunityManagementContext(query.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  try {
    const result = await getTelegramCommunityDailyInsights({
      chatId: query.data.chatId,
      days: query.data.days,
    });
    res.json(GetTelegramCommunityInsightsResponse.parse(result));
  } catch (error) {
    if (error instanceof CommunityMemberStatsMigrationRequiredError) {
      res.status(503).json({ message: "Telegram activity insights are waiting for their database migration." });
      return;
    }
    throw error;
  }
});

router.get("/community/manage/member-history", async (req, res) => {
  const query = GetTelegramCommunityMemberHistoryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Choose a valid group, member, and history period." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;
  const context = await getTelegramCommunityManagementContext(query.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  try {
    const result = await getTelegramCommunityMemberHistory({
      chatId: query.data.chatId,
      memberId: query.data.memberId,
      days: query.data.days,
    });
    if (!result) {
      res.status(404).json({ message: "That member is not tracked in this Telegram group." });
      return;
    }
    res.json(GetTelegramCommunityMemberHistoryResponse.parse(result));
  } catch (error) {
    if (error instanceof CommunityMemberStatsMigrationRequiredError) {
      res.status(503).json({ message: "Member message history is waiting for its database migration." });
      return;
    }
    throw error;
  }
});

router.get("/community/manage/moderation-events", async (req, res) => {
  const query = GetTelegramCommunityModerationEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Check the group and moderation activity page." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;
  const context = await getTelegramCommunityManagementContext(query.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  try {
    const result = await listTelegramCommunityModerationEvents({
      chatId: query.data.chatId,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    res.json(GetTelegramCommunityModerationEventsResponse.parse(result));
  } catch (error) {
    if (isMissingManagementTable(error)) {
      res.status(503).json({ message: "Moderation history is waiting for its database migration." });
      return;
    }
    throw error;
  }
});

router.get("/community/manage/audit", async (req, res) => {
  const query = GetTelegramCommunityManagementAuditQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: "Check the group and administrator activity limit." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;
  const context = await getTelegramCommunityManagementContext(query.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }
  try {
    const events = await listTelegramCommunityManagementAudit({
      chatId: query.data.chatId,
      limit: query.data.limit,
    });
    res.json(GetTelegramCommunityManagementAuditResponse.parse({ events }));
  } catch (error) {
    if (isMissingManagementTable(error)) {
      res.status(503).json({ message: "Administrator history is waiting for its database migration." });
      return;
    }
    throw error;
  }
});

router.post("/community/manage/:chatId/rules/preview", async (req, res) => {
  const params = PreviewTelegramCommunityRulesParams.safeParse(req.params);
  const body = PreviewTelegramCommunityRulesBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Enter a sample message up to 2,000 characters." });
    return;
  }
  const telegramUserId = getOrganisationTelegramUserId(req, res);
  if (telegramUserId === null) return;
  const context = await getTelegramCommunityManagementContext(params.data.chatId, telegramUserId);
  if (!context) {
    res.status(404).json({ message: "This Telegram group is not linked to your organisation." });
    return;
  }

  const [phraseRules, linkRules] = await Promise.all([
    listTelegramCommunityKeywordRules(params.data.chatId, 100),
    listTelegramCommunityLinkRules(params.data.chatId, 100),
  ]);
  const matchedPhraseRuleIds = phraseRules
    .filter((rule) => matchesCommunityModerationPhrase(body.data.text, rule.phrase))
    .map((rule) => rule.id);
  const links = extractCommunityMessageLinks(body.data.text);
  const unapprovedLinks = linkRules.length
    ? links.filter((link) => !isCommunityLinkWhitelisted(link, linkRules))
    : [];
  res.json(PreviewTelegramCommunityRulesResponse.parse({
    protectionEnabled: context.spamProtectionEnabled,
    wouldDelete: context.spamProtectionEnabled
      && (matchedPhraseRuleIds.length > 0 || unapprovedLinks.length > 0),
    matchedPhraseRuleIds,
    unapprovedLinks,
  }));
});

router.post("/community/me", async (req, res) => {
  const parsed = AddMyCommunityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a public Telegram group username or t.me link." });
    return;
  }

  const user = currentUser(req);
  const telegramUserId = Number(user.telegramId);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    res.status(400).json({
      message: "This profile needs a linked Telegram identity before group membership can be verified.",
    });
    return;
  }

  const verified = await verifyTelegramCommunityMembership(
    parsed.data.group,
    telegramUserId,
  );
  if (verified.status === "invalid") {
    res.status(400).json({
      message: "Use a public Telegram group username or t.me link, not a private invite link.",
    });
    return;
  }
  if (verified.status === "unavailable") {
    res.status(503).json({
      message: "Telegram could not verify this group. Check the link and make sure the Experiences.fun bot is an administrator in the group.",
    });
    return;
  }
  if (verified.status === "not_member") {
    res.status(403).json({
      message: "Telegram could not confirm that your account is a member of this group.",
    });
    return;
  }

  const [inserted] = await db
    .insert(communityMembersTable)
    .values({
      chatId: verified.chatId,
      chatTitle: verified.title,
      userId: user.id,
      communityXp: 0,
      contributionCount: 0,
      qualifyingMessages: 0,
    })
    .onConflictDoNothing()
    .returning({ id: communityMembersTable.id });

  const community = await getCommunityMemberSummary(verified.chatId, user.id);
  if (!community) {
    res.status(500).json({ message: "The verified group could not be linked to your profile." });
    return;
  }
  res.status(inserted ? 201 : 200).json(community);
});

router.get("/community/:chatId", async (req, res) => {
  const chatId = String(req.params.chatId);
  if (!/^-?\d{1,20}$/.test(chatId)) {
    res.status(400).json({ message: "That community identifier is invalid." });
    return;
  }

  const details = await getCommunityDetails(chatId, currentUser(req).id);
  if (!details) {
    res.status(404).json({ message: "You have not earned Community XP in this group." });
    return;
  }
  res.json(details);
});

export default router;