import { Router, type IRouter } from "express";
import { currentUser, requireTelegramUser } from "../lib/auth";
import { getCommunityDetails, getMyCommunities } from "../lib/contribution";

const router: IRouter = Router();
router.use(requireTelegramUser);

router.get("/community/me", async (req, res) => {
  const user = currentUser(req);
  res.json({ communities: await getMyCommunities(user.id) });
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