import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "@/api/v1/models/user.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse"; 
import { AuthRequest } from "@/api/v1/interfaces/auth"; 
import env from "@/config/env";

// ==========================================
// CREATE USER
// ==========================================
export const createUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { fullName, mobile, role, loginId, password } = req.body;

    const existingUser = await User.findOne({ loginId }).session(session);
    if (existingUser) {
      throw new Error("User with this loginId already exists");
    }

    const newUser = new User({ fullName, mobile, role, loginId, password });
    await newUser.save({ session });

    await session.commitTransaction();
    
    const userResponse = newUser.toObject();
    delete userResponse.password;

    return httpResponse(req, res, 201, "User created successfully", userResponse);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET USER BY ID
// ==========================================
export const getUserById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    
    if (!user) throw new Error("User not found");

    return httpResponse(req, res, 200, "User fetched successfully", user);
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// GET ALL USERS
// ==========================================
export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({});
    return httpResponse(req, res, 200, "Users fetched successfully", users);
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// UPDATE USER
// ==========================================
export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Prevent updating password via this route
    if (updateData.password) delete updateData.password;

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { 
      new: true, runValidators: true, session 
    });

    if (!updatedUser) throw new Error("User not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "User updated successfully", updatedUser);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// TOGGLE STATUS
// ==========================================
export const toggleStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const user = await User.findById(id).session(session);
    
    if (!user) throw new Error("User not found");

    user.isActive = !user.isActive;
    await user.save({ session });

    await session.commitTransaction();
    return httpResponse(req, res, 200, "User status toggled successfully", { isActive: user.isActive });
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// CHANGE PASSWORD
// ==========================================
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?._id; // Extracted from protect middleware

    const user = await User.findById(userId).select("+password").session(session);
    if (!user) throw new Error("User not found");

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) throw new Error("Incorrect old password");

    user.password = newPassword;
    await user.save({ session }); // Triggers pre-save hook to hash new password

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Password changed successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// LOGIN
// ==========================================
export const login = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { loginId, password } = req.body;

    const user = await User.findOne({ loginId }).select("+password");
    if (!user) throw new Error("Invalid credentials");
    if (!user.isActive) throw new Error("Account is disabled. Contact Admin.");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error("Invalid credentials");

    const token = jwt.sign({ id: user._id, role: user.role }, env.TOKEN_SECRET, {
      expiresIn: "1d",
    });

    const userResponse = user.toObject();
    delete userResponse.password;
    return httpResponse(req, res, 200, "Login successful", { user: userResponse});
  } catch (error) {
    return httpError(next, error, req, 401);
  }
};

// ==========================================
// LOGOUT
// ==========================================
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.clearCookie('token');
    return httpResponse(req, res, 200, "Logged out successfully");
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// ME (Get current user profile)
// ==========================================
export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error("Not authenticated");

    return httpResponse(req, res, 200, "Profile fetched successfully", req.user);
  } catch (error) {
    return httpError(next, error, req, 401);
  }
};