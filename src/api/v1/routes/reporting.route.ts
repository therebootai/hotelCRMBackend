import { Router } from "express";
import {
  getOccupancyStats,
  getRevenueStats,
  getBookingStats,
  getDueAgingStats,
  getCustomerStats,
  getGstSummaryStats,
} from "../controllers/reporting.controller";
import { protect } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/requirePermission.middleware";

const router = Router();

// Protect all reporting endpoints behind auth and VIEW_REPORTS permission
router.use(protect);
router.use(requirePermission("VIEW_REPORTS"));

router.get("/occupancy", getOccupancyStats);
router.get("/revenue", getRevenueStats);
router.get("/bookings", getBookingStats);
router.get("/due-aging", getDueAgingStats);
router.get("/customers", getCustomerStats);
router.get("/gst-summary", getGstSummaryStats);

export default router;
