import mongoose, { Schema, Document } from "mongoose";

export interface IExtraService extends Document {
  name: string;
  description: string;
  price: number;
  taxPercentage: number;
  isActive: boolean;
}

const ExtraServiceSchema = new Schema<IExtraService>(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true },
    taxPercentage: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExtraService = mongoose.model<IExtraService>("ExtraService", ExtraServiceSchema);