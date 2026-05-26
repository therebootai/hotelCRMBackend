import mongoose, { ClientSession } from "mongoose";
import { RoomStatus, RoomStatusEnum, IRoomStatus } from "../models/roomStatus.model";
import { Room } from "../models/room.model";

export const updateRoomStatus = async (
  roomId: string | mongoose.Types.ObjectId,
  status: RoomStatusEnum,
  updatedBy: string | mongoose.Types.ObjectId,
  notes?: string,
  opts?: { session?: ClientSession }
): Promise<IRoomStatus> => {
  const session = opts?.session || await mongoose.startSession();
  let localTransaction = false;
  if (!opts?.session) {
    session.startTransaction();
    localTransaction = true;
  }

  try {
    const rId = new mongoose.Types.ObjectId(roomId);
    const uId = new mongoose.Types.ObjectId(updatedBy);

    // Sync state back to Room model if status indicates Maintenance or Blocked
    let roomModelStatus: "Active" | "Maintenance" | "Blocked" = "Active";
    if (status === RoomStatusEnum.Maintenance) {
      roomModelStatus = "Maintenance";
    } else if (status === RoomStatusEnum.Occupied) {
      roomModelStatus = "Blocked";
    }

    await Room.findByIdAndUpdate(rId, { status: roomModelStatus }, { session });

    let record = await RoomStatus.findOne({ roomId: rId }).session(session);
    if (!record) {
      record = new RoomStatus({
        roomId: rId,
        status,
        lastUpdated: new Date(),
        updatedBy: uId,
        notes: notes || "Initial status set"
      });
    } else {
      record.status = status;
      record.lastUpdated = new Date();
      record.updatedBy = uId;
      if (notes) record.notes = notes;
    }

    await record.save({ session });

    if (localTransaction) {
      await (session as ClientSession).commitTransaction();
    }
    return record;
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

export const getRoomsByStatus = async (status: RoomStatusEnum): Promise<any[]> => {
  const statuses = await RoomStatus.find({ status }).populate("roomId");
  return statuses.map(s => s.roomId).filter(Boolean);
};

export const getRoomsPendingCleaning = async (): Promise<any[]> => {
  const statuses = await RoomStatus.find({
    status: { $in: [RoomStatusEnum.Dirty, RoomStatusEnum.InspectionPending] }
  }).populate("roomId");
  return statuses.map(s => s.roomId).filter(Boolean);
};
