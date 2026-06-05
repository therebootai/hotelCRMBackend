import mongoose, { ClientSession } from "mongoose";
import { Booking } from "../models/booking.model";
import { allocateExactRoom, releaseRoomByCheckin } from "./inventory.service";
import { updateRoomStatus } from "./housekeeping.service";
import { RoomStatusEnum } from "../models/roomStatus.model";
import { CheckIn } from "../models/checkin.model";
import { sendNotificationToRole } from "./notification.service";

export type BookingStatus =
  | "Pending"
  | "Confirmed"
  | "Checked-In"
  | "Checked-Out"
  | "Cancelled"
  | "No-Show"
  | "Hold";

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ["Confirmed", "Cancelled", "No-Show", "Hold"],
  Confirmed: ["Checked-In", "Cancelled", "No-Show", "Hold"],
  "Checked-In": ["Checked-Out"],
  "Checked-Out": [],
  Cancelled: [],
  "No-Show": [],
  Hold: ["Confirmed", "Cancelled", "Pending"],
};

export const transitionBookingState = async (
  bookingId: string | mongoose.Types.ObjectId,
  newState: BookingStatus,
  context: { userId: string | mongoose.Types.ObjectId; notes?: string },
  opts?: { session?: ClientSession }
): Promise<any> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) throw new Error("Booking not found");

    const oldState = booking.status as BookingStatus;
    if (oldState === newState) {
      if (localTransaction) {
        await (session as ClientSession).commitTransaction();
      }
      return booking;
    }

    const allowed = ALLOWED_TRANSITIONS[oldState] || [];
    if (!allowed.includes(newState)) {
      throw new Error(`Transition from ${oldState} to ${newState} is not allowed`);
    }

    // Execute side effects
    if (newState === "Checked-In") {
      // Allocate physical room if specified
      if (booking.rooms && booking.rooms.length > 0) {
        // Find corresponding checkin record
        const checkin = await CheckIn.findOne({ bookingId: booking._id }).session(session);
        if (checkin) {
          for (const roomItem of booking.rooms) {
            if (roomItem.roomId) {
              await allocateExactRoom(checkin._id, roomItem.roomId, context.userId, { session });
            }
          }
        }
      }
    } else if (newState === "Checked-Out") {
      const checkin = await CheckIn.findOne({ bookingId: booking._id }).session(session);
      if (checkin) {
        // Release physical rooms
        await releaseRoomByCheckin(checkin._id, { session });
        // Set housekeeping dirty status
        for (const rd of checkin.roomDetails) {
          await updateRoomStatus(rd.roomId, RoomStatusEnum.Dirty, context.userId, "Dirty after guest checkout", { session });
        }
      }
    } else if (newState === "Cancelled" || newState === "No-Show") {
      const checkin = await CheckIn.findOne({ bookingId: booking._id }).session(session);
      if (checkin) {
        await releaseRoomByCheckin(checkin._id, { session });
      }
    }

    booking.status = newState;
    booking.activityLogs.push({
      action: `Status Transitioned: ${oldState} -> ${newState}`,
      performedBy: new mongoose.Types.ObjectId(context.userId),
      timestamp: new Date(),
      details: context.notes || "No additional comments"
    });

    await booking.save({ session });

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }

    try {
      const relatedId = booking._id as mongoose.Types.ObjectId;
      await sendNotificationToRole("Manager", "booking", `Booking ${newState}`, `Booking status updated to ${newState}`, relatedId, "Booking");
      await sendNotificationToRole("Reception", "booking", `Booking ${newState}`, `Booking status updated to ${newState}`, relatedId, "Booking");

      if (newState === "Checked-In") {
        await sendNotificationToRole("Housekeeping", "housekeeping", `Guest Checked In`, `Guest in booking is now checked in. Please check room readiness status.`, relatedId, "Booking");
      } else if (newState === "Checked-Out") {
        await sendNotificationToRole("Housekeeping", "housekeeping", `Guest Checked Out`, `Guest in booking is checked out. Cleanup required.`, relatedId, "Booking");
      }
    } catch (notifErr) {
      console.error("Failed to send state transition notifications:", notifErr);
    }

    return booking;
  } catch (error) {
    if (localTransaction) {
      await (session as ClientSession).abortTransaction();
    }
    throw error;
  } finally {
    if (localTransaction) {
      session.endSession();
    }
  }
};
