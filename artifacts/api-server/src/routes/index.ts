import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chequesRouter from "./cheques";
import banksRouter from "./banks";
import partiesRouter from "./parties";
import settingsRouter from "./settingsRoute";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chequesRouter);
router.use(banksRouter);
router.use(partiesRouter);
router.use(settingsRouter);

export default router;
