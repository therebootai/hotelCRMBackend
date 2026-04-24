import express from "express";
import { extendStay, getCheckInList, getStayOverview, processCheckIn } from "../controllers/checkin.controller";

const router = express.Router();

router.post("/process", processCheckIn);
router.get("/list", getCheckInList);
router.patch("/extend-stay", extendStay);
router.get("/stay-overview", getStayOverview);


export default router;