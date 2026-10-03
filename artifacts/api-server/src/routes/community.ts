import { Router, type IRouter } from "express";
import { AddMyCommunityBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { communityMembersTable } from "@workspace/db/schema";
import { currentUser, requireTelegramUser } from "../lib/auth";
import {
  getCommunityDetails,
  getCommunityMemberSummary,
  getMyCommunities,
} from "../lib/contribution";
import { verifyTelegramCommunityMembership } from "../lib/telegram";

const router: IRouter = Router();
router.use(requireTelegramUser);

router.get("/community/me", async (req, res) => {
  const user = currentUser(req);
  res.json({ communities: await getMyCommunities(user.id) });
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