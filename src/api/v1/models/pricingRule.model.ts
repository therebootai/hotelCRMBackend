import mongoose, { Schema, Document } from "mongoose";

export interface IPricingRule extends Document {
  roomId: mongoose.Types.ObjectId;
  date: Date;
  price: number;
}

const PricingRuleSchema = new Schema<IPricingRule>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    date: { type: Date, required: true },
    price: { type: Number, required: true },
  },
  { timestamps: true },
);

PricingRuleSchema.index({ roomId: 1, date: 1 }, { unique: true });

export const PricingRule = mongoose.model<IPricingRule>(
  "PricingRule",
  PricingRuleSchema,
);