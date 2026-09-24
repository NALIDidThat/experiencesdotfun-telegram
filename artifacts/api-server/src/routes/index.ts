import { Router, type IRouter } from "express";
import healthRouter from "./health";
import experiencesRouter from "./experiences";
import botRouter from "./bot";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(communityRouter);
router.use(experiencesRouter);

export default router;
