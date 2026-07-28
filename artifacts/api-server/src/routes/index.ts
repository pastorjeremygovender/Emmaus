import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emmausRouter from "./emmaus";
import bibleRouter from "./bible";
import bibleAiRouter from "./bible-ai";
import youtubeArchiveRouter from "./youtube-archive";
import journeysRouter from "./journeys";
import collectionsRouter from "./collections";
import writingAssistantRouter from "./writing-assistant";
import { devotionalsRouter } from "./devotionals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emmausRouter);
router.use(bibleRouter);
router.use(bibleAiRouter);
router.use(youtubeArchiveRouter);
router.use(journeysRouter);
router.use(collectionsRouter);
router.use(writingAssistantRouter);
router.use("/devotionals", devotionalsRouter);

export default router;
