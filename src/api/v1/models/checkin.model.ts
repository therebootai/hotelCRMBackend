import mongoose, { Schema, Document } from "mongoose";

export interface IGuestDetail {
  name: string;
  mobileNo?: string;
  idType?: string;
  idNumber?: string;
  idDocument: {
    public_id: string;
    secure_url: string;
  };
  isPrimary: boolean;
}

export interface IRoomStayDetail {
  roomId: mongoose.Types.ObjectId;
  roomType: mongoose.Types.ObjectId;
  roomNumber: string;
  appliedPrice: number;
  originalPrice: number;
}

export interface IAdvancePayment {
  amount: number;
  paymentMode: "Cash" | "Online" | "Card";
  transactionId?: string;
  paidAt: Date;
  note?: string;
}

export interface ICorporateCheckInDetails {
  companyName?: string;
  companyGST?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;

  contactPersonName?: string;
  designation?: string;
  contactMobile?: string;
  contactEmail?: string;

  contactIdType?: string;
  contactIdNumber?: string;

  contactIdDocument?: {
    public_id?: string;
    secure_url?: string;
  };

  guestListImage?: {
    public_id?: string;
    secure_url?: string;
  };

  companyDocument?: {
    public_id?: string;
    secure_url?: string;
  };

  totalGuests?: number;
  department?: string;
  visitPurpose?: string;

  remarks?: string;
}

export interface ICheckIn extends Document {
  bookingId: mongoose.Types.ObjectId;
   roomDetails: IRoomStayDetail[];
  guests: IGuestDetail[];

  checkInType: "Individual" | "Corporate";
  corporateCheckInDetails: ICorporateCheckInDetails;
  checkInTime: Date;
  expectedCheckOutTime: Date;
  actualCheckOutTime?: Date;

  status: "Active" | "Checked-Out" | "Shifted";
  stayType: "Original" | "Extended" | "Transferred";

  previousCheckInId?: mongoose.Types.ObjectId;
  nextCheckInId?: mongoose.Types.ObjectId;
 
  advancePayments: IAdvancePayment[];
  totalAdvanceAmount: number;

  extraBed: {
    hasExtraBed: boolean;
    chargePerNight: number;
  };

  isBilled: boolean;
  notes?: string;
}

const CheckInSchema = new Schema<ICheckIn>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },

    // ✅ ROOM TRACKING: roomIds er poriborte amra roomDetails use korbo
    // jate protiti room er alada applied price thake
    roomDetails: [
      {
        roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
        roomType: { type: Schema.Types.ObjectId, ref: "RoomType" },
        roomNumber: { type: String },
        originalPrice: { type: Number },
        appliedPrice: { type: Number }, // Ekhane discount ba manual adjustment thakbe
      },
    ],

    guests: [
      {
        name: { type: String, required: true },
        mobileNo: { type: String },
        idType: { type: String },
        idNumber: { type: String },
        idDocument: {
          public_id: { type: String },
          secure_url: { type: String },
        },
        isPrimary: { type: Boolean, default: false },
      },
    ],

    checkInType: {
      type: String,
      enum: ["Individual", "Corporate"],
      default: "Individual",
    },

    corporateCheckInDetails: {
      companyName: { type: String },

      companyGST: { type: String },

      companyAddress: { type: String },

      companyEmail: { type: String },

      companyPhone: { type: String },

      contactPersonName: { type: String },

      designation: { type: String },

      contactMobile: { type: String },

      contactEmail: { type: String },

      contactIdType: { type: String },

      contactIdNumber: { type: String },

      contactIdDocument: {
        public_id: { type: String },

        secure_url: { type: String },
      },

      guestListImage: {
        public_id: { type: String },

        secure_url: { type: String },
      },

      companyDocument: {
        public_id: { type: String },

        secure_url: { type: String },
      },

      totalGuests: { type: Number },

      department: { type: String },

      visitPurpose: { type: String },

      remarks: { type: String },
    },

    checkInTime: { type: Date, required: true },
    expectedCheckOutTime: { type: Date, required: true },
    actualCheckOutTime: { type: Date },

    status: {
      type: String,
      enum: ["Active", "Checked-Out", "Shifted"],
      default: "Active",
    },

    stayType: {
      type: String,
      enum: ["Original", "Extended", "Transferred"],
      default: "Original",
    },

    advancePayments: [
      {
        amount: { type: Number, default: 0 },
        paymentMode: { type: String, enum: ["Cash", "Online", "Card"] },
        transactionId: { type: String },
        paidAt: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    totalAdvanceAmount: { type: Number, default: 0 },

    extraBed: {
      hasExtraBed: { type: Boolean, default: false },
      chargePerNight: { type: Number, default: 0 },
    },

    isBilled: { type: Boolean, default: false },
    notes: { type: String },

    previousCheckInId: { type: Schema.Types.ObjectId, ref: "CheckIn" },
    nextCheckInId: { type: Schema.Types.ObjectId, ref: "CheckIn" },
  },
  { timestamps: true },
);

CheckInSchema.index({ bookingId: 1, status: 1 });

export const CheckIn = mongoose.model<ICheckIn>("CheckIn", CheckInSchema);
