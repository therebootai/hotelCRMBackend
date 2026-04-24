import mongoose, { Schema, Document } from "mongoose";

export interface IExtraService extends Document {
  name: string;
  isActive: boolean;
}

const ExtraServiceSchema = new Schema<IExtraService>(
  {
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ExtraService = mongoose.model<IExtraService>("ExtraService", ExtraServiceSchema);