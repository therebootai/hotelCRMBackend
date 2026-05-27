import mongoose, { Schema, Document } from "mongoose";

export interface IGstLedger extends Document {
  period: string; // "YYYY-MM"
  billingId: mongoose.Types.ObjectId;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGST: number;
  customerName: string;
  customerGSTNumber?: string;
  invoiceNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const GstLedgerSchema = new Schema<IGstLedger>(
  {
    period: {
      type: String,
      required: true,
    },
    billingId: {
      type: Schema.Types.ObjectId,
      ref: "Billing",
      required: true,
      unique: true,
    },
    taxableAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    igstAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalGST: {
      type: Number,
      required: true,
      default: 0,
    },
    customerName: {
      type: String,
      required: true,
    },
    customerGSTNumber: {
      type: String,
    },
    invoiceNumber: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

GstLedgerSchema.index({ period: 1 });
GstLedgerSchema.index({ invoiceNumber: 1 });

export const GstLedger = mongoose.model<IGstLedger>("GstLedger", GstLedgerSchema);
