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

// Payment Schema
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

// Add-on Schema
export interface IAddonDetail {
  name: string;
  quantity: number;
  rate: number;
  total: number;
}

// ==========================================
// GRC (GUEST REGISTRATION CARD) SCHEMA
// ==========================================

export interface IGRCDetail {
  grcNumber: string;
  grcType: "Individual" | "Corporate" | "Group";
  generatedAt: Date;
  generatedBy: mongoose.Types.ObjectId;
  pdfUrl?: string;
  signedPdfUrl?: string;
  isSigned: boolean;
  signedAt?: Date;
  signatureMethod?: "Physical" | "Digital" | "Online";
  notes?: string;
}

// ==========================================
// GUEST DETAIL SCHEMA
// ==========================================

export interface IGuestDetail {
  name: string;
  mobileNo?: string;
  idType?: string;
  idNumber?: string;
  idDocument?: {
    public_id: string;
    secure_url: string;
  };
  assignedRoomId?: mongoose.Types.ObjectId;

  // Extended Guest Fields
  relationship?: string;
  age?: number;
  gender?: string;
  nationality?: string;
  dateOfBirth?: Date;
  livePhoto?: {
    public_id: string;
    secure_url: string;
  };
  ocrVerification?: {
    isVerified: boolean;
    verifiedAt?: Date;
    data?: any;
  };
  idVerificationStatus?: "Pending" | "Verified" | "Rejected";
  isPrimary: boolean;
}

// ==========================================
// ROOM STAY DETAIL SCHEMA
// ==========================================

export interface IRoomStayDetail {
  roomId: mongoose.Types.ObjectId;
  roomType: mongoose.Types.ObjectId;
  roomNumber: string;
  originalPrice: number;
  appliedPrice: number;
  assignedAt: Date;
  assignedBy?: mongoose.Types.ObjectId;
}

// ==========================================
// CORPORATE CHECK-IN DETAILS SCHEMA
// ==========================================

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

  guestListDocument?: {
    public_id?: string;
    secure_url?: string;
  };
  authorizationLetter?: {
    public_id?: string;
    secure_url?: string;
  };
  companyDocument?: {
    public_id?: string;
    secure_url?: string;
  };

  department?: string;
  visitPurpose?: string;
  remarks?: string;
}

// ==========================================
// PACKAGE DETAIL SCHEMA (For Day Access)
// ==========================================

export interface IPackageDetail {
  packageId: mongoose.Types.ObjectId;
  packageName: string;
  packageType: string;
  entryTime?: Date;
  exitTime?: Date;
}

// ==========================================
// CHECK-IN MODEL INTERFACE
// ==========================================

export interface ICheckIn extends Document {
  // Core Identifiers
  checkInId: string;
  bookingId: mongoose.Types.ObjectId;

  // Booking Category
  bookingCategory: "Room Stay" | "Day Access" | "Event";

  // Check-in Type
  checkInType: "Individual" | "Corporate";

  // Room Details Array
  roomDetails: IRoomStayDetail[];

  // Guests Array
  guests: IGuestDetail[];

  // Primary Guest Reference
  primaryGuestId?: mongoose.Types.ObjectId;

  // Corporate Check-in Details
  corporateCheckInDetails?: ICorporateCheckInDetails;

  // Package Details (Day Access)
  packageDetails?: IPackageDetail;

  // Check-in & Checkout Times
  checkInTime: Date;
  expectedCheckOutTime: Date;
  actualCheckOutTime?: Date;

  // Status
  status: "Active" | "Checked-Out" | "Shifted";

  // Stay Type
  stayType: "Original" | "Extended" | "Transferred";

  // Check-in History (for room transfers)
  previousCheckInId?: mongoose.Types.ObjectId;
  nextCheckInId?: mongoose.Types.ObjectId;

  // Payment Summary
  paymentStatus: "Pending" | "Partial" | "Paid";
  paymentSummary: {
    totalAmount: number;
    totalPaid: number;
    dueAmount: number;
    taxAmount: number;
  };

  // Payments Array
  payments: IPaymentDetail[];

  // GRC Details (Multiple GRCs Support)
  grcDetails: IGRCDetail[];

  // Documents Array
  documents: IDocumentDetail[];

  // Add-ons Array
  addons: IAddonDetail[];

  // Vehicle Details (Multiple)
  vehicleDetails: IVehicleDetail[];

  // Liability & Terms
  liabilityAccepted: boolean;
  termsAcceptedAt?: Date;

  // Verification Checklist
  verificationChecklist: {
    primaryGuestVerified: boolean;
    idUploaded: boolean;
    grcGenerated: boolean;
    paymentCollected: boolean;
    roomAssigned: boolean;
  };

  // Checkout Verification Checklist
  checkoutVerification?: {
    guestVacated: boolean;
    keyReturned: boolean;
    roomChecked: boolean;
    noDamage: boolean;
    damageFound: boolean;
    damageAmount: number;
    damageRemarks: string;
    staffNotes: string;
    verifiedAt?: Date;
    verifiedBy?: mongoose.Types.ObjectId;
  };

  // Check-in Progress (Step-based)
  currentStep: number;
  completedSteps: number[];

  // Billed Flag
  isBilled: boolean;

  // Notes
  notes?: string;
  specialRequests?: string;
  totalAdvanceAmount?: number;

  // Activity Logs
  activityLogs: IActivityLog[];
}

// ==========================================
// CHECK-IN SCHEMA
// ==========================================

const CheckInSchema = new Schema<ICheckIn>(
  {
    // Core Identifiers
    checkInId: { type: String, required: true, unique: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },

    // Booking Category
    bookingCategory: {
      type: String,
      enum: ["Room Stay", "Day Access", "Event"],
      default: "Room Stay",
    },

    // Check-in Type
    checkInType: {
      type: String,
      enum: ["Individual", "Corporate"],
      default: "Individual",
    },

    // Room Details Array
    roomDetails: [
      {
        roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
        roomType: { type: Schema.Types.ObjectId, ref: "RoomType" },
        roomNumber: { type: String },
        originalPrice: { type: Number },
        appliedPrice: { type: Number },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Guests Array
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
        assignedRoomId: { type: Schema.Types.ObjectId, ref: "Room" },
        relationship: { type: String },
        age: { type: Number },
        gender: { type: String },
        nationality: { type: String },
        dateOfBirth: { type: Date },
        livePhoto: {
          public_id: { type: String },
          secure_url: { type: String },
        },
        ocrVerification: {
          isVerified: { type: Boolean, default: false },
          verifiedAt: { type: Date },
          data: { type: Schema.Types.Mixed },
        },
        idVerificationStatus: {
          type: String,
          enum: ["Pending", "Verified", "Rejected"],
          default: "Pending",
        },
        isPrimary: { type: Boolean, default: false },
      },
    ],

    // Primary Guest Reference
    primaryGuestId: { type: Schema.Types.ObjectId, ref: "Guest" },

    // Corporate Check-in Details
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
      guestListDocument: {
        public_id: { type: String },
        secure_url: { type: String },
      },
      authorizationLetter: {
        public_id: { type: String },
        secure_url: { type: String },
      },
      companyDocument: {
        public_id: { type: String },
        secure_url: { type: String },
      },
      department: { type: String },
      visitPurpose: { type: String },
      remarks: { type: String },
    },

    // Package Details (Day Access)
    packageDetails: {
      packageId: { type: Schema.Types.ObjectId, ref: "Package" },
      packageName: { type: String },
      packageType: { type: String },
      entryTime: { type: Date },
      exitTime: { type: Date },
    },

    // Check-in & Checkout Times
    checkInTime: { type: Date, required: true },
    expectedCheckOutTime: { type: Date, required: true },
    actualCheckOutTime: { type: Date },

    // Status
    status: {
      type: String,
      enum: ["Active", "Checked-Out", "Shifted"],
      default: "Active",
    },

    // Stay Type
    stayType: {
      type: String,
      enum: ["Original", "Extended", "Transferred"],
      default: "Original",
    },

    // Check-in History
    previousCheckInId: { type: Schema.Types.ObjectId, ref: "CheckIn" },
    nextCheckInId: { type: Schema.Types.ObjectId, ref: "CheckIn" },

    // Payment Summary
    paymentStatus: {
      type: String,
      enum: ["Pending", "Partial", "Paid"],
      default: "Pending",
    },
    paymentSummary: {
      totalAmount: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      dueAmount: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
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

    // GRC Details (Multiple GRCs Support)
    grcDetails: [
      {
        grcNumber: { type: String, required: true },
        grcType: {
          type: String,
          enum: ["Individual", "Corporate", "Group"],
          default: "Individual",
        },
        generatedAt: { type: Date, default: Date.now },
        generatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        pdfUrl: { public_id: { type: String }, secure_url: { type: String } },
        signedPdfUrl: {
          public_id: { type: String },
          secure_url: { type: String },
        },
        isSigned: { type: Boolean, default: false },
        signedAt: { type: Date },
        signatureMethod: {
          type: String,
          enum: ["Physical", "Digital", "Online"],
        },
        notes: { type: String },
      },
    ],

    // Documents Array
    documents: [
      {
        type: { type: String, required: true },
        file: {
          public_id: { type: String },
          secure_url: { type: String },
        },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Add-ons Array
    addons: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        rate: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],

    // Vehicle Details (Multiple)
    vehicleDetails: [
      {
        vehicleNumber: { type: String },
        vehicleType: { type: String },
        driverName: { type: String },
        driverContact: { type: String },
      },
    ],

    // Liability & Terms
    liabilityAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date },

    // Verification Checklist
    verificationChecklist: {
      primaryGuestVerified: { type: Boolean, default: false },
      idUploaded: { type: Boolean, default: false },
      grcGenerated: { type: Boolean, default: false },
      paymentCollected: { type: Boolean, default: false },
      roomAssigned: { type: Boolean, default: false },
    },

    // Checkout Verification Checklist
    checkoutVerification: {
      guestVacated: { type: Boolean, default: false },
      keyReturned: { type: Boolean, default: false },
      roomChecked: { type: Boolean, default: false },
      noDamage: { type: Boolean, default: false },
      damageFound: { type: Boolean, default: false },
      damageAmount: { type: Number, default: 0 },
      damageRemarks: { type: String, default: "" },
      staffNotes: { type: String, default: "" },
      verifiedAt: { type: Date },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    // Check-in Progress (Step-based)
    currentStep: { type: Number, default: 1 },
    completedSteps: [{ type: Number }],

    // Billed Flag
    isBilled: { type: Boolean, default: false },

    // Notes
    notes: { type: String },
    specialRequests: { type: String },
    totalAdvanceAmount: { type: Number, default: 0 },

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

CheckInSchema.index({ bookingId: 1, status: 1 });
CheckInSchema.index({ checkInTime: 1 });
CheckInSchema.index({ expectedCheckOutTime: 1 });
CheckInSchema.index({ status: 1 });
CheckInSchema.index({ paymentStatus: 1 });
CheckInSchema.index({ bookingCategory: 1 });
CheckInSchema.index({ "grcDetails.grcNumber": 1 });

export const CheckIn = mongoose.model<ICheckIn>("CheckIn", CheckInSchema);
