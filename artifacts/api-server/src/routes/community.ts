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
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { communityMembersTable } from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  getCommunityDetails,
  getCommunityMemberSummary,
  getMyCommunities,
} from "../lib/contribution";
import {
  getTelegramCommunityLiveInfo,
  verifyTelegramCommunityMembership,
} from "../lib/telegram";
import {
  addTelegramCommunityKeywordRule,
  addTelegramCommunityLinkRule,
  getTelegramCommunityManagementContext,
  listTelegramCommunityKeywordRules,
  listTelegramCommunityLinkRules,
  listTelegramOwnedCommunitiesForManagement,
  removeTelegramCommunityKeywordRuleById,
  removeTelegramCommunityLinkRuleById,
} from "../lib/community-moderation";

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