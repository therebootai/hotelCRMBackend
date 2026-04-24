import express from "express";
import { createBooking, getAllBookings, getBookingOverview } from "../controllers/booking.controller";

const router = express.Router();

router.post("/create", createBooking);
router.get("/list", getAllBookings);
router.get("/overview", getBookingOverview);

export default router;