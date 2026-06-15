import cron from "node-cron";
import { CheckIn } from "../api/v1/models/checkin.model";
import { waBridgeService } from "../api/v1/services/wabridge.service";
import { startOfDay, endOfDay } from "date-fns";

// Run every day at 09:00 AM
export const initCheckoutReminderCron = () => {
  cron.schedule("0 9 * * *", async () => {
    console.log("[CRON] Running checkout reminder job...");
    try {
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(new Date());

      // Find all active checkins that are expected to checkout today
      const checkins = await CheckIn.find({
        status: "Active",
        expectedCheckOutTime: {
          $gte: todayStart,
          $lte: todayEnd
        }
      });

      console.log(`[CRON] Found ${checkins.length} check-ins checking out today.`);

      for (const checkin of checkins) {
        let phone = "";
        let name = "Guest";

        // Try to get primary guest or corporate contact
        if (checkin.checkInType === "Corporate" && checkin.corporateCheckInDetails?.contactMobile) {
          phone = checkin.corporateCheckInDetails.contactMobile;
          name = checkin.corporateCheckInDetails.contactPersonName || "Guest";
        } else if (checkin.guests && checkin.guests.length > 0) {
          const primaryGuest = checkin.guests.find(g => g.isPrimary) || checkin.guests[0];
          phone = primaryGuest.mobileNo || "";
          name = primaryGuest.name || "Guest";
        }

        if (phone) {
          await waBridgeService.sendCheckoutReminder(phone, name, checkin.expectedCheckOutTime)
            .catch(err => console.error(`[CRON] Failed to send checkout reminder to ${phone}:`, err));
        }
      }

      console.log("[CRON] Checkout reminder job completed.");
    } catch (error) {
      console.error("[CRON] Error running checkout reminder job:", error);
    }
  });
};
