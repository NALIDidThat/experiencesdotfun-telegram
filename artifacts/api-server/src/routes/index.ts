import { Router, type IRouter } from "express";
import healthRouter from "./health";
import experiencesRouter from "./experiences";
import botRouter from "./bot";
import communityRouter from "./community";
import accountabilityRouter from "./accountability";
import accountsRouter from "./accounts";
import analyticsRouter from "./analytics";
import feedRouter from "./feed";
import topFriendsRouter from "./top-friends";
import organisationPartnershipsRouter from "./organisation-partnerships";
import directMessagesRouter from "./direct-messages";
import challengesRouter from "./challenges";
import aiAssistantRouter from "./ai-assistant";
import memoryGameRouter from "./memory-game";
import fundsRouter from "./funds";
import privateEvidenceRouter from "./private-evidence";
import personalCollectionsRouter from "./personal-collections";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use("/accountability", accountabilityRouter);
router.use("/analytics", analyticsRouter);
router.use(feedRouter);
router.use(topFriendsRouter);
router.use("/organisation-partnerships", organisationPartnershipsRouter);
router.use("/direct-messages", directMessagesRouter);
router.use("/challenges", challengesRouter);
router.use("/ai", aiAssistantRouter);
router.use("/memory-game", memoryGameRouter);
router.use("/funds", fundsRouter);
router.use(privateEvidenceRouter);
router.use(personalCollectionsRouter);
// Telegram/email auth routes are public and must be checked before the
// community router's authentication middleware.
router.use(experiencesRouter);
router.use("/accounts", accountsRouter);
router.use(communityRouter);

export default router;
