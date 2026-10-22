import { Router, type IRouter } from "express";
import { TrackAnalyticsEventBody } from "@workspace/api-zod";
import { requireTelegramUser } from "../lib/auth";
import { recordAnalyticsEvent } from "../lib/analytics";

const router: IRouter = Router();

router.use(requireTelegramUser);

router.post("/events", async (req, res) => {
  const parsed = TrackAnalyticsEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "The analytics event is invalid." });
    return;
  }

  await recordAnalyticsEvent({
    source: "app",
    eventName: "screen_view",
    category: parsed.data.screen,
    platform: parsed.data.platform,
    outcome: "success",
  });
  res.status(202).json({ accepted: true });
});

export default router;