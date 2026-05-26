import mongoose, { Schema, Document } from "mongoose";

export interface IRolePermission extends Document {
  roleId: mongoose.Types.ObjectId;
  permissionId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RolePermissionSchema = new Schema<IRolePermission>(
  {
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    permissionId: {
      type: Schema.Types.ObjectId,
      ref: "Permission",
      required: true,
    },
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of role-permission mapping
RolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

export const RolePermission = mongoose.model<IRolePermission>("RolePermission", RolePermissionSchema);
