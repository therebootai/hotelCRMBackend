import express from "express";
import { processCheckIn, getCheckInList, getStayOverview, extendStay, updateCheckIn, getCheckInById } from "../controllers/checkin.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import { requirePermission } from "../middlewares/requirePermission.middleware";
import {
  createCheckinSchema,
  updateCheckinSchema,
  extendStaySchema,
  getCheckInByIdSchema,
  getCheckInListSchema,
} from "@/api/v1/validations/checkin.validation";

const router = express.Router();

// Protect all check-in routes
router.use(protect);

// Check-in view endpoints
router.get("/list", validateRequest(getCheckInListSchema), requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getCheckInList);
router.get("/stay-overview", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getStayOverview);
router.get("/:id", validateRequest(getCheckInByIdSchema), requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getCheckInById);

// Check-in write endpoints
router.post("/process", validateRequest(createCheckinSchema), requirePermission("MANAGE_BOOKINGS"), processCheckIn);
router.patch("/extend-stay", validateRequest(extendStaySchema), requirePermission("MANAGE_BOOKINGS"), extendStay);
router.patch("/:id", validateRequest(updateCheckinSchema), requirePermission("MANAGE_BOOKINGS"), updateCheckIn);

export default router;