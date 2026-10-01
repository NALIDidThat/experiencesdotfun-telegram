import { Router, type IRouter } from "express";
import healthRouter from "./health";
import experiencesRouter from "./experiences";
import botRouter from "./bot";
import communityRouter from "./community";
import accountabilityRouter from "./accountability";
import accountsRouter from "./accounts";
import analyticsRouter from "./analytics";
import feedRouter from "./feed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use("/accountability", accountabilityRouter);
router.use("/analytics", analyticsRouter);
router.use(feedRouter);
// Telegram/email auth routes are public and must be checked before the
// community router's authentication middleware.
router.use(experiencesRouter);
router.use("/accounts", accountsRouter);
router.use(communityRouter);

export default router;
