import mongoose, { Schema, Document } from "mongoose";


export interface IActivityLog {
  action: string;
  performedBy: mongoose.Types.ObjectId;
  timestamp: Date;
  details?: string;
}

export interface IPaymentDetail {
  amount: number;
  paymentMode: "Cash" | "UPI" | "Card" | "Bank Transfer" | "Wallet";
  transactionId?: string;
  paidAt: Date;
  note?: string;
}

// Document Schema
export interface IDocumentDetail {
  type: string;
  file: {
    public_id: string;
    secure_url: string;
  };
  uploadedAt: Date;
  uploadedBy: mongoose.Types.ObjectId;
}


export interface IRoomChargeBreakdown {
  roomId: mongoose.Types.ObjectId;
  roomNumber: string;
  roomType?: string;

  checkInDate: Date;
  checkOutDate: Date;

  nights: number;
  ratePerNight: number;
  totalRoomCharge: number;

  stayType: "Original" | "Extended" | "Transferred";
}


export interface IExtraServiceCharge {
  serviceId: mongoose.Types.ObjectId;
  serviceName: string;
  quantity: number;
  rate: number;
  total: number;
  date: Date;
}

export interface IFacilityCharge {
  facilityBookingId?: mongoose.Types.ObjectId;
  facilityId: mongoose.Types.ObjectId;

  facilityName: string;
  facilityType?: string;

  eventType?: string;

  eventStartDate?: Date;
  eventEndDate?: Date;

  baseAmount: number;

  totalGuests?: number;

  bookedRooms?: {
    roomId: mongoose.Types.ObjectId;
    roomNumber?: string;
    roomType?: string;
    nights?: number;
    ratePerNight: number;
    totalAmount: number;
  }[];

  totalRoomAmount: number;

  decorationCharge: number;
  cateringCharge: number;
  soundCharge: number;
  miscCharge: number;

  totalFacilityCharge: number;
}

export interface IPackageCharge {
  packageId: mongoose.Types.ObjectId;
  packageName: string;
  packageType: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface ITaxBreakdown {
  cgst: number;
  sgst: number;
  serviceCharge: number;
  cess: number;
  totalTax: number;
}

export interface IPaymentModeSummary {
  cash: number;
  upi: number;
  card: number;
  bankTransfer: number;
  wallet: number;
}

export interface IBillingNote {
  note: string;
  addedBy: mongoose.Types.ObjectId;
  addedAt: Date;
}


export interface IBilling extends Document {
  invoiceNumber: string;

  invoiceType: "Room" | "Day Access" | "Event" | "Corporate";

  billingStatus: "Draft" | "Finalized" | "Cancelled" | "Refunded";
  settlementStatus: "Open" | "Settled" | "Partial" | "Bad Debt";

  checkInId?: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  facilityBookingId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  isCorporateBill: boolean;
  corporateDetails?: {
    companyName: string;
    companyGST?: string;
    companyAddress?: string;
    contactPerson?: string;
    contactEmail?: string;
  };
  roomChargesBreakdown: IRoomChargeBreakdown[];
  totalRoomCharges: number;

  extraServices: IExtraServiceCharge[];

  facilityCharges: IFacilityCharge[];
  totalFacilityCharges: number;
  packageCharges: IPackageCharge[];

  otherCharges: number;

  subTotal: number;

  taxBreakdown: ITaxBreakdown;
  discount: number;
  discountReason?: string;
  advanceDeducted: number;
  grandTotal: number;
  paidAmount: number;
    dueAmount: number;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  paymentModeSummary: IPaymentModeSummary;
  payments: IPaymentDetail[];
  refundDetails?: {
    refundAmount: number;
    refundMethod?: "Cash" | "UPI" | "Card" | "Bank Transfer";
    refundedAt?: Date;
    reason: string;
  };

  generatedBy?: mongoose.Types.ObjectId;
  generatedAt?: Date;
  finalizedBy?: mongoose.Types.ObjectId;
  finalizedAt?: Date;
  invoicePdf?: string;
  receiptPdf?: string;
  billingNotes: IBillingNote[];
  notes?: string;
  activityLogs: IActivityLog[];
}

const BillingSchema = new Schema<IBilling>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceType: {
      type: String,
      enum: ["Room", "Day Access", "Event", "Corporate"],
      default: "Room",
    },

    billingStatus: {
      type: String,
      enum: ["Draft", "Finalized", "Cancelled", "Refunded"],
      default: "Draft",
    },
    settlementStatus: {
      type: String,
      enum: ["Open", "Settled", "Partial", "Bad Debt"],
      default: "Open",
    },

    checkInId: {
      type: Schema.Types.ObjectId,
      ref: "CheckIn",
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    facilityBookingId: {
      type: Schema.Types.ObjectId,
      ref: "FacilityBooking",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
    },
    isCorporateBill: {
      type: Boolean,
      default: false,
    },
    corporateDetails: {
      companyName: { type: String },
      companyGST: { type: String },
      companyAddress: { type: String },
      contactPerson: { type: String },
      contactEmail: { type: String },
    },
    roomChargesBreakdown: [
      {
        roomId: { type: Schema.Types.ObjectId, ref: "Room" },
        roomNumber: { type: String },
        roomType: { type: String },
        checkInDate: { type: Date },
        checkOutDate: { type: Date },
        nights: { type: Number },
        ratePerNight: { type: Number },
        totalRoomCharge: { type: Number },
        stayType: {
          type: String,
          enum: ["Original", "Extended", "Transferred"],
          default: "Original",
        },
      },
    ],
    totalRoomCharges: {
      type: Number,
      default: 0,
    },

    extraServices: [
      {
        serviceId: { type: Schema.Types.ObjectId, ref: "ExtraService" },
        serviceName: { type: String },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        date: { type: Date, default: Date.now },
      },
    ],
    facilityCharges: [
      {
        facilityBookingId: {
          type: Schema.Types.ObjectId,
          ref: "FacilityBooking",
        },
        facilityId: {
          type: Schema.Types.ObjectId,
          ref: "Facility",
        },
        facilityName: { type: String },
        facilityType: { type: String },
        eventType: { type: String },
        eventStartDate: { type: Date },
        eventEndDate: { type: Date },
        baseAmount: { type: Number, default: 0 },
        totalGuests: { type: Number, default: 0 },
        bookedRooms: [
          {
            roomId: {
              type: Schema.Types.ObjectId,
              ref: "Room",
            },
            roomNumber: { type: String },
            roomType: { type: String },
            nights: { type: Number, default: 1 },
            ratePerNight: { type: Number, default: 0 },
            totalAmount: { type: Number, default: 0 },
          },
        ],
        totalRoomAmount: { type: Number, default: 0 },
        decorationCharge: { type: Number, default: 0 },
        cateringCharge: { type: Number, default: 0 },
        soundCharge: { type: Number, default: 0 },
        miscCharge: { type: Number, default: 0 },
        totalFacilityCharge: { type: Number, default: 0 },
      },
    ],
    totalFacilityCharges: {
      type: Number,
      default: 0,
    },

    packageCharges: [
      {
        packageId: { type: Schema.Types.ObjectId, ref: "Package" },
        packageName: { type: String },
        packageType: { type: String },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },
    ],

    otherCharges: {
      type: Number,
      default: 0,
    },

    // Sub Total
    subTotal: {
      type: Number,
      default: 0,
    },

    // Tax Breakdown
    taxBreakdown: {
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      serviceCharge: { type: Number, default: 0 },
      cess: { type: Number, default: 0 },
      totalTax: { type: Number, default: 0 },
    },

    // Discount
    discount: {
      type: Number,
      default: 0,
    },
    discountReason: {
      type: String,
    },

    // Advance Deducted
    advanceDeducted: {
      type: Number,
      default: 0,
    },

    // Grand Total
    grandTotal: {
      type: Number,
      default: 0,
    },

    // Paid Amount
    paidAmount: {
      type: Number,
      default: 0,
    },

    // Due Amount
    dueAmount: {
      type: Number,
      default: 0,
    },

    // Payment Status
    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Partial", "Paid"],
      default: "Unpaid",
    },

    // Payment Mode Summary
    paymentModeSummary: {
      cash: { type: Number, default: 0 },
      upi: { type: Number, default: 0 },
      card: { type: Number, default: 0 },
      bankTransfer: { type: Number, default: 0 },
      wallet: { type: Number, default: 0 },
    },

    // Payments Array
    payments: [
      {
        amount: { type: Number, required: true },
        paymentMode: {
          type: String,
          enum: ["Cash", "UPI", "Card", "Bank Transfer", "Wallet", "Online"],
          required: true,
        },
        transactionId: { type: String },
        paidAt: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],

    // Refund Details
    refundDetails: {
      refundAmount: { type: Number, default: 0 },
      refundMethod: {
        type: String,
        enum: ["Cash", "UPI", "Card", "Bank Transfer"],
      },
      refundedAt: { type: Date },
      reason: { type: String },
    },

    // Invoice Workflow
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    generatedAt: {
      type: Date,
    },
    finalizedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    finalizedAt: {
      type: Date,
    },

    // Invoice Files
    invoicePdf: { type: String },
    receiptPdf: { type: String },

    // Billing Notes History
    billingNotes: [
      {
        note: { type: String, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // Notes
    notes: { type: String },

    // Activity Logs
    activityLogs: [
      {
        action: { type: String, required: true },
        performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        timestamp: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// ==========================================
// INDEXES
// ==========================================

BillingSchema.index({ bookingId: 1 });
BillingSchema.index({ checkInId: 1 });
BillingSchema.index({ customerId: 1 });
BillingSchema.index({ paymentStatus: 1 });
BillingSchema.index({ billingStatus: 1 });
BillingSchema.index({ settlementStatus: 1 });
BillingSchema.index({ invoiceType: 1 });

export const Billing = mongoose.model<IBilling>("Billing", BillingSchema);