import express from "express";
import { processCheckIn, getCheckInList, getStayOverview, extendStay, updateCheckIn, getCheckInById } from "../controllers/checkin.controller";

const router = express.Router();

// Single final check-in call - handles multipart with files using express-fileupload
router.post("/process", processCheckIn);

router.get("/list", getCheckInList);
router.get("/:id", getCheckInById);
router.patch("/extend-stay", extendStay);
router.patch("/:id", updateCheckIn);
router.get("/stay-overview", getStayOverview);

export default router;