import mongoose, { Schema, Document } from "mongoose";

export interface IPricingRule extends Document {
  name: string;
  roomTypes: mongoose.Types.ObjectId[];
  roomIds: mongoose.Types.ObjectId[];
  startDate: Date;
  endDate: Date;
  applicableDays: ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[];
  adjustmentType: "fixed_price" | "percentage_increase" | "flat_increase";
  adjustmentValue: number;
  priority: number;
  isActive: boolean;
}

const PricingRuleSchema = new Schema<IPricingRule>(
  {
    name: { type: String, required: true },
    
    // Target constraints
    roomTypes: [{ type: Schema.Types.ObjectId, ref: "RoomType" }],
    roomIds: [{ type: Schema.Types.ObjectId, ref: "Room" }],
    
    // Timeframe
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    applicableDays: [
      {
        type: String,
        enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ],
    
    // Modification logic
    adjustmentType: {
      type: String,
      enum: ["fixed_price", "percentage_increase", "flat_increase"],
      required: true,
    },
    adjustmentValue: { type: Number, required: true },
    
    priority: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PricingRule = mongoose.model<IPricingRule>("PricingRule", PricingRuleSchema);