import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: "system" | "booking" | "housekeeping" | "alert";
  title: string;
  message: string;
  isRead: boolean;
  relatedId?: mongoose.Types.ObjectId;
  relatedType?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["system", "booking", "housekeeping", "alert"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedId: {
      type: Schema.Types.ObjectId,
    },
    relatedType: {
      type: String,
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
