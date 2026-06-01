import mongoose, { Schema, Document } from "mongoose";

export enum LedgerEntryType {
  Charge = "charge",
  Payment = "payment",
  Refund = "refund",
  Adjustment = "adjustment",
  Reversal = "reversal",
}

export enum PaymentMode {
  Cash = "Cash",
  Card = "Card",
  UPI = "UPI",
  NetBanking = "NetBanking",
  Wallet = "Wallet",
  Online = "Online",
}

export interface IPaymentLedger extends Document {
  ledgerId: string;
  billingId: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  entryType: LedgerEntryType;
  amount: number;
  mode: PaymentMode;
  referenceNumber?: string;
  operator: mongoose.Types.ObjectId;
  remarks?: string;
  previousValue: number;
  newValue: number;
  isReversed: boolean;
  reversedBy?: mongoose.Types.ObjectId;
  reversalReason?: string;
  reversalEntryId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentLedgerSchema = new Schema<IPaymentLedger>(
  {
    ledgerId: {
      type: String,
      unique: true,
    },
    billingId: {
      type: Schema.Types.ObjectId,
      ref: "Billing",
      required: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    entryType: {
      type: String,
      enum: Object.values(LedgerEntryType),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    mode: {
      type: String,
      enum: Object.values(PaymentMode),
      required: true,
    },
    referenceNumber: {
      type: String,
    },
    operator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    remarks: {
      type: String,
    },
    previousValue: {
      type: Number,
      default: 0,
    },
    newValue: {
      type: Number,
      default: 0,
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reversalReason: {
      type: String,
    },
    reversalEntryId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentLedger",
    },
  },
  { timestamps: true }
);

PaymentLedgerSchema.index({ billingId: 1 });
PaymentLedgerSchema.index({ bookingId: 1 });
PaymentLedgerSchema.index({ createdAt: 1 });
PaymentLedgerSchema.index({ entryType: 1 });


PaymentLedgerSchema.pre("save", async function () {
  if (this.isNew && !this.ledgerId) {
    const seq = Math.floor(1000 + Math.random() * 9000);
    this.ledgerId = `LED-${Date.now()}-${seq}`;
  }
});

export const PaymentLedger = mongoose.model<IPaymentLedger>("PaymentLedger", PaymentLedgerSchema);
