import express from "express";
import {
  getAvailableRooms,
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  getBookingOverview,
  getBookingCalendar,
} from "../controllers/booking.controller";

const router = express.Router();

// Room Availability Search
router.get("/available", getAvailableRooms);

// Dashboard & Calendar - MUST come before /:id routes
router.get("/overview", getBookingOverview);
router.get("/calendar", getBookingCalendar);

// Booking CRUD Operations
router.post("/create", createBooking);
router.get("/list", getAllBookings);
router.get("/:id", getBookingById);
router.put("/:id", updateBooking);
router.patch("/:id/cancel", cancelBooking);

export default router;