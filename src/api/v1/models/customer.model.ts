import mongoose, { Schema, Document } from "mongoose";

// ==========================================
// CUSTOMER MODEL INTERFACE
// ==========================================

export interface ICustomer extends Document {
  // Core Identifiers
  customerId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;

  // Additional Contact
  alternatePhone?: string;
  dateOfBirth?: Date;
  anniversary?: Date;

  // Identity Proof
  identityProof?: {
    idType: string;
    idNumber: string;
    document?: {
      public_id: string;
      secure_url: string;
    };
    verifiedAt?: Date;
  };

  // Profile Photo
  profilePhoto?: {
    public_id: string;
    secure_url: string;
  };

  // Customer Category
  customerCategory: "Individual" | "Corporate" | "Travel Agent" | "OTA";
  companyName?: string;
  companyGST?: string;

  // Preferences
  preferences?: {
    smokingRoom: boolean;
    highFloor: boolean;
    nearLift: boolean;
    bedType?: string;
    preferredRoomType?: mongoose.Types.ObjectId;
    notes?: string;
  };

  // Statistics
  totalStays: number;
  totalSpend: number;
  lastStayDate?: Date;
  averageRating?: number;

  // Status
  isActive: boolean;
  blacklisted: boolean;
  blacklistReason?: string;

  // Loyalty
  loyaltyPoints: number;
  loyaltyTier?: "Bronze" | "Silver" | "Gold" | "Platinum";

  // Notes
  internalNotes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// CUSTOMER SCHEMA
// ==========================================

const CustomerSchema = new Schema<ICustomer>(
  {
    // Core Identifiers
    customerId: String,
    name: { type: String, required: [true, "Customer name is required"] },
    phone: { type: String, required: [true, "Phone number is required"] },
    email: { type: String },
    address: { type: String },

    // Additional Contact
    alternatePhone: { type: String },
    dateOfBirth: { type: Date },
    anniversary: { type: Date },

    // Identity Proof
    identityProof: {
      idType: { type: String },
      idNumber: { type: String },
      document: {
        public_id: { type: String },
        secure_url: { type: String },
      },
      verifiedAt: { type: Date },
    },

    // Profile Photo
    profilePhoto: {
      public_id: { type: String },
      secure_url: { type: String },
    },

    // Customer Category
    customerCategory: {
      type: String,
      enum: ["Individual", "Corporate", "Travel Agent", "OTA"],
      default: "Individual",
    },
    companyName: { type: String },
    companyGST: { type: String },

    // Preferences
    preferences: {
      smokingRoom: { type: Boolean, default: false },
      highFloor: { type: Boolean, default: false },
      nearLift: { type: Boolean, default: false },
      bedType: { type: String },
      preferredRoomType: { type: Schema.Types.ObjectId, ref: "RoomType" },
      notes: { type: String },
    },

    // Statistics
    totalStays: { type: Number, default: 0 },
    totalSpend: { type: Number, default: 0 },
    lastStayDate: { type: Date },
    averageRating: { type: Number },

    // Status
    isActive: { type: Boolean, default: true },
    blacklisted: { type: Boolean, default: false },
    blacklistReason: { type: String },

    // Loyalty
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyTier: {
      type: String,
      enum: ["Bronze", "Silver", "Gold", "Platinum"],
    },

    // Notes
    internalNotes: { type: String },
  },
  { timestamps: true }
);

// ==========================================
// INDEXES
// ==========================================

CustomerSchema.index({ phone: 1 }, { unique: true });
CustomerSchema.index({ customerId: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ customerCategory: 1 });
CustomerSchema.index({ blacklisted: 1 });
CustomerSchema.index({ loyaltyTier: 1 });

// Auto-generate customerId before save
CustomerSchema.pre("save", async function (next) {
  if (this.isNew && !this.customerId) {
    this.customerId = `CUST-${Date.now().toString().slice(-6)}`;
  }
});

export const Customer = mongoose.model<ICustomer>("Customer", CustomerSchema);