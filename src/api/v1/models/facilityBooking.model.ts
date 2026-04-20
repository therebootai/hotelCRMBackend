import mongoose, { Schema, Document } from "mongoose";

export interface IBookedFacilityRoom {
  roomId: mongoose.Types.ObjectId;
  roomType?: mongoose.Types.ObjectId;

  checkInDate?: Date;
  checkOutDate?: Date;

  nights?: number;
  adults?: number;
  children?: number;

  ratePerNight: number;
  totalAmount: number;

  requiresCheckIn: boolean; // later guest checkin needed?
  status: "Reserved" | "Checked-In" | "Checked-Out" | "Cancelled";
}

export interface IFacilityBooking extends Document {
  bookingId?: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;

  facilityId: mongoose.Types.ObjectId;

  eventType:
    | "Wedding"
    | "Reception"
    | "Birthday"
    | "Corporate Meeting"
    | "Pool Party"
    | "Conference"
    | "Other";

eventStartDate: Date;
eventEndDate: Date;

startTime?: string;
endTime?: string;

totalDays: number;

  totalGuests: number;

  // Hall / Venue Charges
  baseAmount: number;

  // Added Rooms Under Facility Booking
  bookedRooms: IBookedFacilityRoom[];

  totalRoomAmount: number;

  // Other Optional Charges
  decorationCharge: number;
  cateringCharge: number;
  soundCharge: number;
  miscCharge: number;

  advanceAmount: number;
  discount: number;

  finalAmount: number;

  status: "Reserved" | "Confirmed" | "Completed" | "Cancelled";

  notes?: string;
}

const FacilityBookingSchema = new Schema<IFacilityBooking>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    facilityId: {
      type: Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
    },

    eventType: {
      type: String,
      enum: [
        "Wedding",
        "Reception",
        "Birthday",
        "Corporate Meeting",
        "Pool Party",
        "Conference",
        "Other",
      ],
      required: true,
    },

eventStartDate: { type: Date, required: true },
eventEndDate: { type: Date, required: true },

startTime: { type: String },
endTime: { type: String },

totalDays: { type: Number, default: 1 },

    totalGuests: { type: Number, required: true },

    // Hall Charge
    baseAmount: { type: Number, required: true },

    // Rooms Included
    bookedRooms: [
      {
        roomId: {
          type: Schema.Types.ObjectId,
          ref: "Room",
          required: true,
        },

        roomType: {
          type: Schema.Types.ObjectId,
          ref: "RoomType",
        },

        checkInDate: { type: Date },
        checkOutDate: { type: Date },

        nights: { type: Number, default: 1 },

        adults: { type: Number, default: 1 },
        children: { type: Number, default: 0 },

        ratePerNight: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },

        requiresCheckIn: { type: Boolean, default: false },

        status: {
          type: String,
          enum: [
            "Reserved",
            "Checked-In",
            "Checked-Out",
            "Cancelled",
          ],
          default: "Reserved",
        },
      },
    ],

    totalRoomAmount: { type: Number, default: 0 },

    decorationCharge: { type: Number, default: 0 },
    cateringCharge: { type: Number, default: 0 },
    soundCharge: { type: Number, default: 0 },
    miscCharge: { type: Number, default: 0 },

    advanceAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },

    finalAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["Reserved", "Confirmed", "Completed", "Cancelled"],
      default: "Reserved",
    },

    notes: { type: String },
  },
  { timestamps: true }
);

export const FacilityBooking = mongoose.model<IFacilityBooking>(
  "FacilityBooking",
  FacilityBookingSchema
);