import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  fullName: string;
  mobile: string;
  role: "admin" | "receptionist";
  login_id: string;
  password?: string;
  isActive: boolean;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true },
    mobile: { type: String, required: true },
    role: { type: String, enum: ["admin", "receptionist"], required: true },
    login_id: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: true,
      select: false,
      maxlength: [72, "Password cannot exceed 72 characters"],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Hash password before saving
UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords during login
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password!);
};

export const User = mongoose.model<IUser>("User", UserSchema);
