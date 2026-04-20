import mongoose, { Schema, Document } from "mongoose";

export interface ICustomer extends Document {
  name: string;
  phone: string; 
  email?: string;
  address?: string;
  identityProof?: {
    idType: string; 
    idNumber: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
    address: { type: String },
    identityProof: {
      idType: { type: String },
      idNumber: { type: String },
    },
  },
  { timestamps: true }
);

export const Customer = mongoose.model<ICustomer>("Customer", CustomerSchema);