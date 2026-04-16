import mongoose, { Schema, Document } from "mongoose";

export interface ITaxGst extends Document {
  name: string;
  percentage: number;
  type: "Room" | "Food" | "Service";
  isActive: boolean;
}

const TaxGstSchema = new Schema<ITaxGst>(
  {
    name: { type: String, required: true },
    percentage: { type: Number, required: true },
    type: { type: String, enum: ["Room", "Food", "Service"], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TaxGst = mongoose.model<ITaxGst>("TaxGst", TaxGstSchema);