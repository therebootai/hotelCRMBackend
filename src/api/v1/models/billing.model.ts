import mongoose, { Schema, Document } from "mongoose";



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

export interface IExtraService {
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

export interface IPayment {
  amount: number;
  method: "Cash" | "UPI" | "Card" | "Bank Transfer";
  date: Date;
  note?: string;
}



export interface IBilling extends Document {
  customerId: mongoose.Types.ObjectId;

  bookingId?: mongoose.Types.ObjectId;
  facilityBookingId?: mongoose.Types.ObjectId;

  invoiceNumber: string;

  isCorporateBill: boolean;

  corporateDetails?: {
    companyName: string;
    companyGST?: string;
    companyAddress?: string;
  };

  roomChargesBreakdown: IRoomChargeBreakdown[];
  totalRoomCharges: number;

  facilityCharges: IFacilityCharge[];
  totalFacilityCharges: number;

  restaurantCharges: number;

  extraServices: IExtraService[];

  subTotal: number;

  taxPercentage: number;
  taxAmount: number;

  discount: number;
  advanceDeducted: number;

  grandTotal: number;

  paidAmount: number;
  dueAmount: number;

  payments: IPayment[];

  paymentStatus: "Unpaid" | "Partial" | "Paid";

  notes?: string;
}

const BillingSchema = new Schema<IBilling>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },

    facilityBookingId: {
      type: Schema.Types.ObjectId,
      ref: "FacilityBooking",
    },

    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },

    isCorporateBill: {
      type: Boolean,
      default: false,
    },

    corporateDetails: {
      companyName: { type: String },
      companyGST: { type: String },
      companyAddress: { type: String },
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

    restaurantCharges: {
      type: Number,
      default: 0,
    },

    extraServices: [
      {
        serviceName: { type: String },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        date: { type: Date, default: Date.now },
      },
    ],

    subTotal: {
      type: Number,
      default: 0,
    },

    taxPercentage: {
      type: Number,
      default: 0,
    },

    taxAmount: {
      type: Number,
      default: 0,
    },

    discount: {
      type: Number,
      default: 0,
    },

    advanceDeducted: {
      type: Number,
      default: 0,
    },

    grandTotal: {
      type: Number,
      default: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    dueAmount: {
      type: Number,
      default: 0,
    },


    payments: [
      {
        amount: { type: Number, required: true },

        method: {
          type: String,
          enum: ["Cash", "UPI", "Card", "Bank Transfer"],
          required: true,
        },

        date: {
          type: Date,
          default: Date.now,
        },

        note: { type: String },
      },
    ],

    paymentStatus: {
      type: String,
      enum: ["Unpaid", "Partial", "Paid"],
      default: "Unpaid",
    },

    notes: { type: String },
  },
  { timestamps: true }
);

export const Billing = mongoose.model<IBilling>(
  "Billing",
  BillingSchema
);