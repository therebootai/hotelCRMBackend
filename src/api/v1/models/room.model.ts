import mongoose, { Schema, Document } from "mongoose";

export interface IRoom extends Document {
  roomNumber: string;
  roomType: mongoose.Types.ObjectId;
  building?: string;
  floor?: string;
  maxAdults: number;
  maxChildren: number;
  extraBedAllowed: boolean;
  extraBedCharge: number;
  discountPercentage: number;
  gstId?: mongoose.Types.ObjectId;
  roomSize?: number;
  viewType?: string;
  amenities: mongoose.Types.ObjectId[];
  description?: string;
  status: "Active" | "Maintenance" | "Blocked";
}

const RoomSchema = new Schema<IRoom>(
  {
    roomNumber: { type: String, required: true, unique: true },
    roomType: { type: Schema.Types.ObjectId, ref: "RoomType", required: true },
    building: { type: String },
    floor: { type: String },
    
    maxAdults: { type: Number, required: true},
    maxChildren: { type: Number, required: true},
    extraBedAllowed: { type: Boolean, default: false },
    extraBedCharge: { type: Number, default: 0 },
    
    discountPercentage: { type: Number, default: 0 },
    gstId: { type: Schema.Types.ObjectId, ref: "TaxGst" },
    
    roomSize: { type: Number },
    viewType: { type: String },
    amenities: [{ type: Schema.Types.ObjectId, ref: "Amenity" }],
    description: { type: String },
    
    status: {
      type: String,
      enum: ["Active", "Maintenance", "Blocked"],
      default: "Active",
    },
  },
  { timestamps: true }
);

export const Room = mongoose.model<IRoom>("Room", RoomSchema);