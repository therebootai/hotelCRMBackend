import mongoose, { Schema, Document } from "mongoose";

export interface IUserRole extends Document {
  userId: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserRoleSchema = new Schema<IUserRole>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of user-role mapping
UserRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });

export const UserRole = mongoose.model<IUserRole>("UserRole", UserRoleSchema);
