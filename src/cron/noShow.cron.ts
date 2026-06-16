import cron from "node-cron";
import { Booking } from "../api/v1/models/booking.model";
import { startOfDay } from "date-fns";

// Run every day at Midnight (12:00 AM)
export const initNoShowCron = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Running No-Show update job...");
    try {
      const todayStart = startOfDay(new Date());

      // Find all confirmed bookings where the check-in date was yesterday or earlier
      const expiredBookings = await Booking.find({
        status: "Confirmed",
        overallCheckInDate: {
          $lt: todayStart
        }
      });

      console.log(`[CRON] Found ${expiredBookings.length} bookings to mark as No-Show.`);

      for (const booking of expiredBookings) {
        booking.status = "No-Show";
        await booking.save();
        console.log(`[CRON] Marked booking ${booking.bookingId} as No-Show.`);
      }

      console.log("[CRON] No-Show update job completed.");
    } catch (error) {
      console.error("[CRON] Error running No-Show update job:", error);
    }
  });
};
