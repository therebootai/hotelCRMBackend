import mongoose, { Schema, Document } from "mongoose";

// ==========================================
// REUSABLE NESTED SCHEMAS
// ==========================================

// Vehicle Details Schema
export interface IVehicleDetail {
  vehicleNumber: string;
  vehicleType?: string;
  driverName?: string;
  driverContact?: string;
}

// Activity Log Schema
export interface IActivityLog {
  action: string;
  performedBy: mongoose.Types.ObjectId;
  timestamp: Date;
  details?: string;
}

// Cancellation Details Schema
export interface ICancellationDetails {
  cancelledAt: Date;
  cancelledBy: mongoose.Types.ObjectId;
  reason: string;
  refundAmount: number;
}

export interface IBookingAddon {
  serviceId: mongoose.Types.ObjectId;
  serviceName: string;
  quantity: number;
  rate: number;
  total: number;
  taxPercentage?: number;
  taxAmount?: number;
}

// ==========================================
// BOOKING MODEL INTERFACE
// ==========================================

export interface IBookedRoom {
  roomType: mongoose.Types.ObjectId;
  roomId?: mongoose.Types.ObjectId;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  pricePerNight: number;
  mealPlan?: "EP" | "CP" | "MAP" | "AP";
  hasExtraBed?: boolean;
  extraBedCharge?: number;
}

export interface IPricingSummary {
  roomTotal: number;
  discountAmount: number;
  taxAmount: number;
  taxPercentage: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
}

export interface ICorporateDetails {
  companyName: string;
  gstNumber?: string;
  contactPerson: string;
  mobile: string;
  email?: string;
  address?: string;
  negotiatedRate?: number;
  companyCode?: string;
  notes?: string;
}

export interface IBooking extends Document {
  // Core Identifiers
  bookingId: string;
  customerId: mongoose.Types.ObjectId;

  // Booking Category
  bookingCategory: "Room Stay" | "Day Access" | "Event" | "Banquet";
  bookingType: "Individual" | "Corporate";

  // Rooms Array (Optional for Day Access bookings)
  rooms?: IBookedRoom[];

  // Overall Stay Dates (Optional for Day Access bookings)
  overallCheckInDate?: Date;
  overallCheckOutDate?: Date;
  totalNights?: number;

  // Day Access Package Reference & Visit Date
  accessPackageId?: mongoose.Types.ObjectId;
  visitDate?: Date;

  // Guest Summary
  totalAdults: number;
  totalChildren: number;
  totalGuests: number;
  totalRooms?: number;

  // Corporate Details
  corporateDetails?: ICorporateDetails;

  // Booking Contact Snapshot (Immutable at booking time)
  bookingContact: {
    name: string;
    mobile: string;
    email?: string;
  };

  // Meal Plan
  mealPlan?: "EP" | "CP" | "MAP" | "AP";

  // Status
  status:
    | "Tentative"
    | "Confirmed"
    | "Checked-In"
    | "Checked-Out"
    | "Cancelled"
    | "No-Show";

  // Booking Source
  source:
    | "Website"
    | "Phone"
    | "Walk-in"
    | "Booking.com"
    | "Agoda"
    | "Goibibo"
    | "MakeMyTrip"
    | "Corporate"
    | "Travel Agent";

  // OTA / External Reference
  externalBookingId?: string;

  // Booking Hold Expiry


  // Payment Tracking
  paymentStatus: "Pending" | "Partial" | "Paid" | "Refunded";
  advanceAmount: number;
  paymentMode?: string;
  paymentRemarks?: string;

  // Pricing Summary
  pricingSummary: IPricingSummary;

  // Tax/GST Reference (from tax-gst master selected at booking creation)
  taxGstId?: mongoose.Types.ObjectId;

  // Cancellation Details
  cancellationDetails?: ICancellationDetails;

  // Arrival Details
  estimatedArrivalTime?: string;
  pickupRequired: boolean;

  // Vehicle Details (Multiple)
  vehicleDetails: IVehicleDetail[];

  // Addons
  addons: IBookingAddon[];

  // Room Preferences
  preferences?: {
    smokingRoom: boolean;
    highFloor: boolean;
    nearLift: boolean;
    bedType?: string;
  };

  // Internal Staff Notes
  internalNotes?: string;

  // Special Requests
  specialRequests?: string;

  // Purpose of Visit
  purposeOfVisit?: string;

  // Activity Logs
  activityLogs: IActivityLog[];
}

// ==========================================
// BOOKING SCHEMA
// ==========================================

const BookingSchema = new Schema<IBooking>(
  {
    // Core Identifiers
    bookingId: {
      type: String,
      default: () => `BK-${Date.now().toString().slice(-6)}`,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // Booking Category
    bookingCategory: {
      type: String,
      enum: ["Room Stay", "Day Access", "Event", "Banquet"],
      default: "Room Stay",
    },
    bookingType: {
      type: String,
      enum: ["Individual", "Corporate"],
      default: "Individual",
    },

    // Rooms Array
    rooms: {
      type: [
        {
          roomType: {
            type: Schema.Types.ObjectId,
            ref: "RoomType",
            required: true,
          },
          roomId: { type: Schema.Types.ObjectId, ref: "Room" },
          checkInDate: { type: Date, required: true },
          checkOutDate: { type: Date, required: true },
          adults: { type: Number, default: 1 },
          children: { type: Number, default: 0 },
          pricePerNight: { type: Number, required: true },
          mealPlan: { type: String, enum: ["EP", "CP", "MAP", "AP"] },
          hasExtraBed: { type: Boolean, default: false },
          extraBedCharge: { type: Number, default: 0 },
        },
      ],
      default: undefined,
    },

    // Overall Stay Dates
    overallCheckInDate: { type: Date },
    overallCheckOutDate: { type: Date },
    totalNights: { type: Number },

    // Day Access Package Reference & Visit Date
    accessPackageId: {
      type: Schema.Types.ObjectId,
      ref: "DayAccessPackage",
    },
    visitDate: { type: Date },

    // Guest Summary
    totalAdults: { type: Number, default: 1 },
    totalChildren: { type: Number, default: 0 },
    totalGuests: { type: Number, default: 1 },
    totalRooms: { type: Number },

    // Corporate Details
    corporateDetails: {
      companyName: { type: String },
      gstNumber: { type: String },
      contactPerson: { type: String },
      mobile: { type: String },
      email: { type: String },
      address: { type: String },
      negotiatedRate: { type: Number },
      companyCode: { type: String },
      notes: { type: String },
    },

    // Booking Contact Snapshot
    bookingContact: {
      name: { type: String, required: true },
      mobile: { type: String, required: true },
      email: { type: String },
    },

    // Meal Plan
    mealPlan: { type: String, enum: ["EP", "CP", "MAP", "AP"] },

    // Status
    status: {
      type: String,
      enum: [
        "Tentative",
        "Confirmed",
        "Checked-In",
        "Checked-Out",
        "Cancelled",
        "No-Show",
      ],
      default: "Tentative",
    },

    // Booking Source
    source: {
      type: String,
      enum: [
        "Website",
        "Phone",
        "Walk-in",
        "Booking.com",
        "Agoda",
        "Goibibo",
        "MakeMyTrip",
        "Corporate",
        "Travel Agent",
      ],
      default: "Walk-in",
    },

    // OTA / External Reference
    externalBookingId: { type: String },

    // Booking Hold Expiry


    // Payment Tracking
    paymentStatus: {
      type: String,
      enum: ["Pending", "Partial", "Paid", "Refunded"],
      default: "Pending",
    },
    advanceAmount: { type: Number, default: 0 },
    paymentMode: { type: String },
    paymentRemarks: { type: String },

    // Pricing Summary
    pricingSummary: {
      roomTotal: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      taxPercentage: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      paidAmount: { type: Number, default: 0 },
      dueAmount: { type: Number, default: 0 },
    },

    // Tax/GST Reference (from tax-gst master selected at booking creation)
    taxGstId: {
      type: Schema.Types.ObjectId,
      ref: "TaxGst",
    },

    // Cancellation Details
    cancellationDetails: {
      cancelledAt: { type: Date },
      cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
      reason: { type: String },
      refundAmount: { type: Number, default: 0 },
    },

    // Arrival Details
    estimatedArrivalTime: { type: String },
    pickupRequired: { type: Boolean, default: false },

    // Vehicle Details (Multiple)
    vehicleDetails: [
      {
        vehicleNumber: { type: String },
        vehicleType: { type: String },
        driverName: { type: String },
        driverContact: { type: String },
      },
    ],

    // Addons
    addons: [
      {
        serviceId: { type: Schema.Types.ObjectId, ref: "ExtraService" },
        serviceName: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, required: true },
        total: { type: Number, required: true },
        taxPercentage: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
      },
    ],

    // Room Preferences
    preferences: {
      smokingRoom: { type: Boolean, default: false },
      highFloor: { type: Boolean, default: false },
      nearLift: { type: Boolean, default: false },
      bedType: { type: String },
    },

    // Internal Staff Notes
    internalNotes: { type: String },

    // Special Requests
    specialRequests: { type: String },

    // Purpose of Visit
    purposeOfVisit: { type: String },

    // Activity Logs
    activityLogs: [
      {
        action: { type: String, required: true },
        performedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],
  },
  { timestamps: true },
);

// ==========================================
// INDEXES
// ==========================================

BookingSchema.index({ bookingId: 1 }, { unique: true });
BookingSchema.index({ customerId: 1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ paymentStatus: 1 });
BookingSchema.index({ "rooms.checkInDate": 1 });
BookingSchema.index({ "rooms.checkOutDate": 1 });
BookingSchema.index({ bookingCategory: 1 });
BookingSchema.index({ bookingType: 1 });
BookingSchema.index({ externalBookingId: 1 });

export const Booking = mongoose.model<IBooking>("Booking", BookingSchema);
