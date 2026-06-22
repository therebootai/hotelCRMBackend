import mongoose, { Schema, Document } from "mongoose";

export interface IRoomType extends Document {
  name: string;
  description?: string;
  basePrice: number;
  discountPercentage?: number;
  isActive: boolean;
  gstId?: mongoose.Types.ObjectId;
}

const RoomTypeSchema = new Schema<IRoomType>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    basePrice: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    gstId: { type: Schema.Types.ObjectId, ref: "TaxGst" },
  },
  { timestamps: true },
);

export const RoomType = mongoose.model<IRoomType>("RoomType", RoomTypeSchema);
