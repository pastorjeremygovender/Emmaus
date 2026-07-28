import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emmausRouter from "./emmaus";
import { authRouter } from "./auth";
import bibleRouter from "./bible";
import bibleAiRouter from "./bible-ai";
import youtubeArchiveRouter from "./youtube-archive";
import journeysRouter from "./journeys";
import collectionsRouter from "./collections";
import writingAssistantRouter from "./writing-assistant";
import { devotionalsRouter } from "./devotionals";
import sermonGeneratorRouter from "./sermon-generator";
import { sermonCompanionsRouter } from "./sermon-companions";
import { adminSermonsRouter } from "./admin-sermons";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(emmausRouter);
router.use(bibleRouter);
router.use(bibleAiRouter);
router.use(youtubeArchiveRouter);
router.use(journeysRouter);
router.use(collectionsRouter);
router.use(writingAssistantRouter);
router.use("/devotionals", devotionalsRouter);
router.use(sermonGeneratorRouter);
router.use("/sermon-companions", sermonCompanionsRouter);
router.use("/admin-sermons", adminSermonsRouter);

export default router;
