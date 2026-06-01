import mongoose, { Schema, Document } from "mongoose";

export interface IPermission extends Document {
  code: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);



export const Permission = mongoose.model<IPermission>("Permission", PermissionSchema);
