import mongoose, { ClientSession } from "mongoose";
import { Room } from "@/api/v1/models/room.model";
import { Booking } from "@/api/v1/models/booking.model";
import { CheckIn } from "@/api/v1/models/checkin.model";
import { MaintenanceBlock } from "@/api/v1/models/maintenanceBlock.model";
import { RoomStatus, RoomStatusEnum } from "@/api/v1/models/roomStatus.model";

interface IPopulatedRoomType {
  _id: mongoose.Types.ObjectId;
  basePrice: number;
  name?: string;
}

// ==========================================
// LAYER 1 — ROOM TYPE AVAILABILITY
// ==========================================

export const getRoomTypeAvailability = async (
  roomTypeId: string | mongoose.Types.ObjectId,
  checkIn: Date,
  checkOut: Date
): Promise<number> => {
  const roomTypeObjectId = new mongoose.Types.ObjectId(roomTypeId);
  
  // 1. Get all rooms of this type
  const rooms = await Room.find({ roomType: roomTypeObjectId, status: { $ne: "Blocked" } });
  const totalRooms = rooms.length;
  if (totalRooms === 0) return 0;

  const roomIds = rooms.map(r => r._id);

  // 2. Count overlapping bookings (Pending, Confirmed, Checked-In)
  const overlappingBookings = await Booking.find({
    status: { $in: ["Pending", "Confirmed", "Checked-In"] },
    rooms: {
      $elemMatch: {
        roomType: roomTypeObjectId,
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    }
  });

  let bookedCount = 0;
  overlappingBookings.forEach(booking => {
    booking.rooms?.forEach(r => {
      if (
        r.roomType.toString() === roomTypeObjectId.toString() &&
        new Date(r.checkInDate) < checkOut &&
        new Date(r.checkOutDate) > checkIn
      ) {
        bookedCount += r.adults > 0 ? 1 : 0; // or just increment by 1 per room
      }
    });
  });

  // 3. Count active check-ins that do NOT have a booking (e.g. direct walk-ins) to avoid double counting
  const overlappingCheckins = await CheckIn.find({
    status: "Active",
    bookingId: { $exists: false },
    checkInTime: { $lt: checkOut },
    expectedCheckOutTime: { $gt: checkIn },
    "roomDetails.roomType": roomTypeObjectId
  });

  let checkinCount = 0;
  overlappingCheckins.forEach(ci => {
    ci.roomDetails.forEach(rd => {
      if (rd.roomType.toString() === roomTypeObjectId.toString()) {
        checkinCount++;
      }
    });
  });

  // 4. Count overlapping maintenance blocks for rooms of this type
  const maintenanceCount = await MaintenanceBlock.countDocuments({
    roomId: { $in: roomIds },
    isActive: true,
    from: { $lt: checkOut },
    to: { $gt: checkIn }
  });

  // 5. Count rooms currently blocked by housekeeping status (Maintenance or Inspection-Pending)
  const housekeepingBlockedRooms = await RoomStatus.find({
    roomId: { $in: roomIds },
    status: { $in: [RoomStatusEnum.Maintenance, RoomStatusEnum.InspectionPending] }
  }).distinct("roomId");

  const housekeepingBlockedCount = housekeepingBlockedRooms.length;

  const availability = totalRooms - bookedCount - checkinCount - maintenanceCount - housekeepingBlockedCount;
  return Math.max(0, availability);
};

export const getMultipleRoomTypeAvailability = async (
  roomTypeIds: (string | mongoose.Types.ObjectId)[],
  checkIn: Date,
  checkOut: Date
): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  for (const id of roomTypeIds) {
    result[id.toString()] = await getRoomTypeAvailability(id, checkIn, checkOut);
  }
  return result;
};

// ==========================================
// LAYER 2 — PHYSICAL ROOM ALLOCATION
// ==========================================

export const allocateExactRoom = async (
  checkinId: string | mongoose.Types.ObjectId,
  roomId: string | mongoose.Types.ObjectId,
  assignedBy: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<void> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const checkin = await CheckIn.findById(checkinId).session(session);
    if (!checkin) throw new Error("Check-in record not found");

    const room = await Room.findById(roomId).populate("roomType", "basePrice").session(session);
    if (!room) throw new Error("Room not found");

    // Check conflict
    const hasConflict = await checkRoomConflict(roomId, checkin.checkInTime, checkin.expectedCheckOutTime);
    if (hasConflict) {
      throw new Error(`Room ${room.roomNumber} is occupied or blocked during this period.`);
    }

    // Check housekeeping status
    const roomStatusRecord = await RoomStatus.findOne({ roomId }).sort({ lastUpdated: -1 }).session(session);
    if (roomStatusRecord && [RoomStatusEnum.Maintenance, RoomStatusEnum.InspectionPending].includes(roomStatusRecord.status)) {
      throw new Error(`Room ${room.roomNumber} cannot be allocated due to status: ${roomStatusRecord.status}`);
    }

    // Update Room status
    room.status = "Blocked";
    await room.save({ session });

    // Update Room status model if exists, or create one
    if (roomStatusRecord) {
      roomStatusRecord.status = RoomStatusEnum.Occupied;
      roomStatusRecord.lastUpdated = new Date();
      roomStatusRecord.updatedBy = new mongoose.Types.ObjectId(assignedBy);
      await roomStatusRecord.save({ session });
    } else {
      await RoomStatus.create([{
        roomId,
        status: RoomStatusEnum.Occupied,
        lastUpdated: new Date(),
        updatedBy: new mongoose.Types.ObjectId(assignedBy),
        notes: "Allocated via check-in"
      }], { session });
    }

    // Add to check-in roomDetails
    const roomDetailIndex = checkin.roomDetails.findIndex(rd => rd.roomId.toString() === roomId.toString());
    if (roomDetailIndex === -1) {
      checkin.roomDetails.push({
        roomId: room._id as mongoose.Types.ObjectId,
        roomType: room.roomType,
        roomNumber: room.roomNumber,
        originalPrice: (room.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
        appliedPrice: (room.roomType as unknown as IPopulatedRoomType | null)?.basePrice || 0,
        assignedAt: new Date(),
        assignedBy: new mongoose.Types.ObjectId(assignedBy)
      });
      await checkin.save({ session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
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

export const releaseRoom = async (
  roomId: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<void> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const room = await Room.findById(roomId).session(session);
    if (!room) throw new Error("Room not found");

    room.status = "Active";
    await room.save({ session });

    // Update RoomStatus to Clean/Dirty
    await RoomStatus.findOneAndUpdate(
      { roomId },
      {
        status: RoomStatusEnum.Dirty,
        lastUpdated: new Date(),
        notes: "Released after checkout"
      },
      { upsert: true, session }
    );

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
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

export const releaseRoomByCheckin = async (
  checkinId: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<void> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const checkin = await CheckIn.findById(checkinId).session(session);
    if (!checkin) throw new Error("Check-in record not found");

    for (const rd of checkin.roomDetails) {
      await releaseRoom(rd.roomId, { session });
    }

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
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

// ==========================================
// MAINTENANCE BLOCKING
// ==========================================

export const blockRoomForMaintenance = async (
  roomId: string | mongoose.Types.ObjectId,
  from: Date,
  to: Date,
  reason: string,
  blockedBy: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<void> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const newBlock = new MaintenanceBlock({
      roomId,
      from,
      to,
      reason,
      blockedBy,
      isActive: true
    });
    await newBlock.save({ session });

    await Room.findByIdAndUpdate(roomId, { status: "Maintenance" }, { session });

    await RoomStatus.findOneAndUpdate(
      { roomId },
      {
        status: RoomStatusEnum.Maintenance,
        lastUpdated: new Date(),
        updatedBy: new mongoose.Types.ObjectId(blockedBy),
        notes: `Maintenance block: ${reason}`
      },
      { upsert: true, session }
    );

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
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

export const releaseMaintenanceBlock = async (
  maintenanceBlockId: string | mongoose.Types.ObjectId,
  opts?: { session?: ClientSession }
): Promise<void> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const block = await MaintenanceBlock.findById(maintenanceBlockId).session(session);
    if (!block) throw new Error("Maintenance block not found");

    block.isActive = false;
    await block.save({ session });

    await Room.findByIdAndUpdate(block.roomId, { status: "Active" }, { session });

    await RoomStatus.findOneAndUpdate(
      { roomId: block.roomId },
      {
        status: RoomStatusEnum.Clean,
        lastUpdated: new Date(),
        notes: "Maintenance block released"
      },
      { upsert: true, session }
    );

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
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

// ==========================================
// EXPIRED HOLDS
// ==========================================

export const releaseExpiredHolds = async (): Promise<number> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const expiredBookings = await Booking.find({
      status: "Pending",
      expiresAt: { $lt: new Date() }
    }).session(session);

    let releasedCount = 0;
    for (const booking of expiredBookings) {
      booking.status = "Cancelled";
      booking.internalNotes = (booking.internalNotes || "") + "\nCancelled automatically due to expired hold.";
      await booking.save({ session });
      releasedCount++;
    }

    await session.commitTransaction();
    return releasedCount;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// ==========================================
// CONFLICT CHECKING
// ==========================================

export const checkRoomConflict = async (
  roomId: string | mongoose.Types.ObjectId,
  checkIn: Date,
  checkOut: Date
): Promise<boolean> => {
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  // 1. Check overlapping active checkins
  const activeCheckinConflict = await CheckIn.findOne({
    status: "Active",
    "roomDetails.roomId": roomObjectId,
    checkInTime: { $lt: checkOut },
    expectedCheckOutTime: { $gt: checkIn }
  });
  if (activeCheckinConflict) return true;

  // 2. Check overlapping maintenance blocks
  const maintenanceConflict = await MaintenanceBlock.findOne({
    roomId: roomObjectId,
    isActive: true,
    from: { $lt: checkOut },
    to: { $gt: checkIn }
  });
  if (maintenanceConflict) return true;

  // 3. Check overlapping confirmed bookings specifying this exact roomId
  const bookingConflict = await Booking.findOne({
    status: { $in: ["Pending", "Confirmed"] },
    rooms: {
      $elemMatch: {
        roomId: roomObjectId,
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    }
  });
  if (bookingConflict) return true;

  return false;
};

export const getMaintenanceBlocks = async (
  roomId: string | mongoose.Types.ObjectId,
  from: Date,
  to: Date
): Promise<any[]> => {
  return await MaintenanceBlock.find({
    roomId: new mongoose.Types.ObjectId(roomId),
    isActive: true,
    from: { $lt: to },
    to: { $gt: from }
  });
};
