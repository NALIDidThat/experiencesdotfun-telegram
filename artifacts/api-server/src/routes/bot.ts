import { Router, type IRouter } from "express";
import { getTelegramBotUsername } from "../lib/telegram";

const router: IRouter = Router();

router.get("/bot/info", async (_req, res) => {
  res.json({ username: await getTelegramBotUsername() });
});

export default router;