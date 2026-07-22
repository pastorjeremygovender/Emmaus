import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emmausRouter from "./emmaus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emmausRouter);

export default router;
