

import mongoose, { Schema, Document } from "mongoose";

export interface IFacility extends Document {
  name: string;
  type: "Marriage Hall" | "Banquet Hall" | "Conference Hall" | "Pool" | "Lawn" | "Rooftop" | "Other";
  capacity: number;

  pricingType: "Hourly" | "Slot" | "Full Day";

  basePrice: number;

  amenities?: string[];
  description?: string;

  status: "Active" | "Maintenance" | "Blocked";
}

const FacilitySchema = new Schema<IFacility>(
  {
    name: { type: String, required: true, unique: true },

    type: {
      type: String,
      enum: [
        "Marriage Hall",
        "Banquet Hall",
        "Conference Hall",
        "Pool",
        "Lawn",
        "Rooftop",
        "Other",
      ],
      required: true,
    },

    capacity: { type: Number, required: true },

    pricingType: {
      type: String,
      enum: ["Hourly", "Slot", "Full Day"],
      default: "Full Day",
    },

    basePrice: { type: Number, required: true },

    amenities: [{ type: String }],

    description: { type: String },

    status: {
      type: String,
      enum: ["Active", "Maintenance", "Blocked"],
      default: "Active",
    },
  },
  { timestamps: true }
);

export const Facility = mongoose.model<IFacility>(
  "Facility",
  FacilitySchema
);