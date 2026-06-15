import express, { Router } from "express";
import {
  getAvailableRooms,
  getRoomTypeAvailableCount,
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getBookingOverview,
  getBookingCalendar,
  emailReceipt,
} from "../controllers/booking.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import { requirePermission } from "../middlewares/requirePermission.middleware";
import {
  createBookingSchema,
  updateBookingSchema,
  cancelBookingSchema,
  getBookingByIdSchema,
} from "@/api/v1/validations/booking.validation";

const router = Router();

// Protect all booking routes
router.use(protect);

// Booking view endpoints (Accessible by booking managers or report viewers)
router.get("/available", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getAvailableRooms);
router.get("/room-type-count", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getRoomTypeAvailableCount);
router.get("/overview", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getBookingOverview);
router.get("/calendar", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getBookingCalendar);
router.get("/list", requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getAllBookings);
router.get("/:id", validateRequest(getBookingByIdSchema), requirePermission(["MANAGE_BOOKINGS", "VIEW_REPORTS"]), getBookingById);

// Booking write endpoints (Requires MANAGE_BOOKINGS permission)
router.post("/create", validateRequest(createBookingSchema), requirePermission("MANAGE_BOOKINGS"), createBooking);
router.put("/:id", validateRequest(updateBookingSchema), requirePermission("MANAGE_BOOKINGS"), updateBooking);
router.patch("/:id/cancel", validateRequest(cancelBookingSchema), requirePermission("MANAGE_BOOKINGS"), cancelBooking);
router.post("/:id/email-receipt", requirePermission("MANAGE_BOOKINGS"), emailReceipt);

export default router;