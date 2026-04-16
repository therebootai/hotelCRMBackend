import mongoose, { Schema, Document } from "mongoose";

export interface IAmenity extends Document {
  name: string;
  icon: string; // String identifier for frontend icon library (e.g., 'wifi', 'tv')
  isActive: boolean;
}

const AmenitySchema = new Schema<IAmenity>(
  {
    name: { type: String, required: true },
    icon: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Amenity = mongoose.model<IAmenity>("Amenity", AmenitySchema);