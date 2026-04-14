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
    const { fullName, mobile, role, login_id, password } = req.body;

    const existingUser = await User.findOne({ login_id }).session(session);
    if (existingUser) {
      throw new Error("User with this login_id already exists");
    }

    const newUser = new User({ fullName, mobile, role, login_id, password });
    await newUser.save({ session });

    await session.commitTransaction();
    
    // Remove password from response
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
    const { login_id, password } = req.body;

    const user = await User.findOne({ login_id }).select("+password");
    if (!user) throw new Error("Invalid credentials");
    if (!user.isActive) throw new Error("Account is disabled. Contact Admin.");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new Error("Invalid credentials");

    // Replace "YOUR_SECRET_KEY" with your actual env secret
    const token = jwt.sign({ id: user._id, role: user.role }, env.TOKEN_SECRET, {
      expiresIn: "1d",
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return httpResponse(req, res, 200, "Login successful", { user: userResponse, token });
  } catch (error) {
    return httpError(next, error, req, 401);
  }
};

// ==========================================
// LOGOUT
// ==========================================
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // If you are using cookies: res.clearCookie('token');
    // If using Bearer tokens, logout is mostly handled client-side by destroying the token
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
    // req.user is populated by your authentication/protect middleware
    if (!req.user) throw new Error("Not authenticated");

    return httpResponse(req, res, 200, "Profile fetched successfully", req.user);
  } catch (error) {
    return httpError(next, error, req, 401);
  }
};