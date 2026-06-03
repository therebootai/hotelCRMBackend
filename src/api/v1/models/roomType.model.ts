import mongoose, { Schema, Document } from "mongoose";

export interface IRoomType extends Document {
  name: string;
  description?: string;
  basePrice: number;
  isActive: boolean;
}

const RoomTypeSchema = new Schema<IRoomType>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    basePrice: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const RoomType = mongoose.model<IRoomType>("RoomType", RoomTypeSchema);
