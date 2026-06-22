import cron from "node-cron";
import { CheckIn } from "../api/v1/models/checkin.model";
import { Booking } from "../api/v1/models/booking.model";

// Run every 5 minutes
export const initDayAccessCheckoutCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    // console.log("[CRON] Running Day Access auto-checkout job...");
    try {
      const now = new Date();

      // Find all active checkins that have passed their expected checkout time
      const checkins = await CheckIn.find({
        status: "Active",
        expectedCheckOutTime: { $lte: now }
      }).populate("bookingId");

      let autoCheckedOutCount = 0;

      for (const checkin of checkins) {
        // Only auto-checkout Day Access bookings
        const booking = checkin.bookingId as any;
        if (booking && booking.bookingCategory === "Day Access") {
          
          checkin.status = "Checked-Out";
          checkin.actualCheckOutTime = new Date();
          checkin.isBilled = true; // Day Access is prepaid
          await checkin.save();

          await Booking.findByIdAndUpdate(booking._id, { status: "Checked-Out" });
          
          autoCheckedOutCount++;
        }
      }

      if (autoCheckedOutCount > 0) {
        console.log(`[CRON] Auto-checked out ${autoCheckedOutCount} Day Access booking(s).`);
      }
    } catch (error) {
      console.error("[CRON] Error running Day Access auto-checkout job:", error);
    }
  });
};
