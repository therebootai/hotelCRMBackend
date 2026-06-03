import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { RoomType } from "@/api/v1/models/roomType.model";
import { Room } from "@/api/v1/models/room.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE ROOM TYPE
// ==========================================
export const createRoomType = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, description, basePrice } = req.body;
    let uploadedImageUrls: string[] = [];

    const existingRoomType = await RoomType.findOne({ name }).session(session);
    if (existingRoomType) {
      throw new Error("A Room Type with this name already exists");
    }

    const newRoomType = new RoomType({
      name,
      description,
      basePrice,
      images: uploadedImageUrls,
    });

    await newRoomType.save({ session });
    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Room Type created successfully",
      newRoomType
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL ROOM TYPES
// ==========================================
export const getAllRoomTypes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { activeOnly } = req.query;
    const filter = activeOnly === "true" ? { isActive: true } : {};

    const roomTypes = await RoomType.find(filter).sort({ createdAt: -1 });

    return httpResponse(
      req,
      res,
      200,
      "Room Types fetched successfully",
      roomTypes
    );
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ROOM TYPE BY ID
// ==========================================
export const getRoomTypeById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const roomType = await RoomType.findById(id);

    if (!roomType) throw new Error("Room Type not found");

    return httpResponse(
      req,
      res,
      200,
      "Room Type fetched successfully",
      roomType
    );
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE ROOM TYPE
// ==========================================
export const updateRoomType = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { name, description, basePrice } = req.body;

    const roomType = await RoomType.findById(id).session(session);
    if (!roomType) throw new Error("Room Type not found");


    if (name) roomType.name = name;
    if (description !== undefined) roomType.description = description;
    if (basePrice !== undefined && basePrice !== roomType.basePrice) {
      roomType.basePrice = basePrice;
      await Room.updateMany({ roomType: id }, { $set: { basePrice } }, { session });
    }

    await roomType.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 200, "Room Type updated successfully", roomType);
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
export const toggleRoomTypeStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const roomType = await RoomType.findById(id).session(session);
    if (!roomType) throw new Error("Room Type not found");

    roomType.isActive = !roomType.isActive;
    await roomType.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Room Type status toggled to ${roomType.isActive ? 'Active' : 'Inactive'}`,
      { isActive: roomType.isActive }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE ROOM TYPE
// ==========================================
export const deleteRoomType = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const roomType = await RoomType.findById(id).session(session);
    if (!roomType) throw new Error("Room Type not found");

    await RoomType.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Room Type and associated media deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};