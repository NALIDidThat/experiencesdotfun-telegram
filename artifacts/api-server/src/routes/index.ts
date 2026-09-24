import { Router, type IRouter } from "express";
import healthRouter from "./health";
import experiencesRouter from "./experiences";
import botRouter from "./bot";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
// Telegram/email auth routes are public and must be checked before the
// community router's authentication middleware.
router.use(experiencesRouter);
router.use(communityRouter);

export default router;
