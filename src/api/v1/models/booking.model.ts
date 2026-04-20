import mongoose, { Schema, Document } from "mongoose";

export interface IBookedRoom {
  roomType: mongoose.Types.ObjectId; 
  roomId?: mongoose.Types.ObjectId; 
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  pricePerNight: number;
}


export interface ICorporateDetails {
  companyName: string;
  gstNumber?: string;
  contactPerson: string;
  mobile: string;
  email?: string;
  address?: string;
  totalGuests?: number;
  expectedRooms?: number;
  negotiatedRate?: number;
  companyCode?: string;
  notes?: string;
}

export interface IBooking extends Document {
  bookingId: string; 
  customerId: mongoose.Types.ObjectId;
  rooms: IBookedRoom[];
  bookingType: "Individual" | "Corporate";
corporateDetails?: ICorporateDetails;
  status: "Pending" | "Confirmed" | "Checked-In" | "Completed" | "Cancelled";
  source: "Website" | "Phone" | "Walk-in";
  advanceAmount: number;
  totalEstimatedAmount: number;
  specialRequests?: string;
  isDirectCheckIn: boolean; 
}

const BookingSchema = new Schema<IBooking>(
  {
    bookingId: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    
 
    rooms: [
      {
        roomType: { type: Schema.Types.ObjectId, ref: "RoomType", required: true },
        roomId: { type: Schema.Types.ObjectId, ref: "Room" }, 
        checkInDate: { type: Date, required: true },
        checkOutDate: { type: Date, required: true },
        adults: { type: Number, default: 1 },
        children: { type: Number, default: 0 },
        pricePerNight: { type: Number, required: true }
      }
    ],

    bookingType: { 
  type: String, 
  enum: ["Individual", "Corporate"], 
  default: "Individual" 
},
    corporateDetails: {
      companyName: { type: String },
      gstNumber: { type: String },
      contactPerson: { type: String },
      mobile: { type: String },
      email: { type: String },
      address: { type: String },
      totalGuests: { type: Number },
      expectedRooms: { type: Number },

 

      negotiatedRate: { type: Number },
      companyCode: { type: String },
      notes: { type: String },
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Checked-In", "Completed", "Cancelled"],
      default: "Pending",
    },
    
    source: { 
      type: String, 
      enum: ["Website", "Phone", "Walk-in"], 
      default: "Walk-in" 
    },

    advanceAmount: { type: Number, default: 0 },
    totalEstimatedAmount: { type: Number, default: 0 },
    specialRequests: { type: String },
    
    
    isDirectCheckIn: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Booking = mongoose.model<IBooking>("Booking", BookingSchema);