import mongoose, { Schema, Document } from "mongoose";

export enum RoomStatusEnum {
  Clean = "Clean",
  Dirty = "Dirty",
  Occupied = "Occupied",
  Maintenance = "Maintenance",
  InspectionPending = "Inspection-Pending",
}

export interface IRoomStatus extends Document {
  roomId: mongoose.Types.ObjectId;
  status: RoomStatusEnum;
  lastUpdated: Date;
  updatedBy: mongoose.Types.ObjectId;
  notes?: string;
  scheduledFor?: Date;
}

const RoomStatusSchema = new Schema<IRoomStatus>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: Object.values(RoomStatusEnum),
      required: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
    },
    scheduledFor: {
      type: Date,
    },
  },
  { timestamps: true }
);

RoomStatusSchema.index({ status: 1 });

export const RoomStatus = mongoose.model<IRoomStatus>("RoomStatus", RoomStatusSchema);
