import mongoose, { Schema, Document } from "mongoose";

export interface IMaintenanceBlock extends Document {
  roomId: mongoose.Types.ObjectId;
  from: Date;
  to: Date;
  reason: string;
  blockedBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceBlockSchema = new Schema<IMaintenanceBlock>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    from: {
      type: Date,
      required: true,
    },
    to: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    blockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

MaintenanceBlockSchema.index({ roomId: 1 });
MaintenanceBlockSchema.index({ from: 1, to: 1 });
MaintenanceBlockSchema.index({ isActive: 1 });

export const MaintenanceBlock = mongoose.model<IMaintenanceBlock>("MaintenanceBlock", MaintenanceBlockSchema);
