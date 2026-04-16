import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Room } from "@/api/v1/models/room.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE ROOM
// ==========================================
export const createRoom = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const roomData = req.body;

    const existingRoom = await Room.findOne({ roomNumber: roomData.roomNumber }).session(session);
    if (existingRoom) {
      throw new Error(`Room number ${roomData.roomNumber} already exists`);
    }

    const newRoom = new Room(roomData);
    await newRoom.save({ session });

    await session.commitTransaction();

    return httpResponse(req, res, 201, "Room created successfully", newRoom);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL ROOMS (With Pagination)
// ==========================================
export const getAllRooms = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page = "1", limit = "10", status, roomType, building } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filter: any = {};
    if (status) filter.status = status;
    if (roomType) filter.roomType = roomType;
    if (building) filter.building = building;

    // Fetch data and total count concurrently for better performance
    const [rooms, totalCount] = await Promise.all([
      Room.find(filter)
        .populate("roomType", "name")
        .populate("amenities", "name icon")
        .populate("gstId", "name percentage")
        .sort({ roomNumber: 1 })
        .skip(skip)
        .limit(limitNumber),
      Room.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    return httpResponse(req, res, 200, "Rooms fetched successfully", {
      rooms,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      }
    });
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET ROOM BY ID
// ==========================================
export const getRoomById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    
    const room = await Room.findById(id)
        .populate("roomType", "name description images")
        .populate("amenities", "name icon")
        .populate("gstId", "name percentage type");

    if (!room) throw new Error("Room not found");

    return httpResponse(req, res, 200, "Room fetched successfully", room);
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE ROOM
// ==========================================
export const updateRoom = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.roomNumber) {
      const existingRoom = await Room.findOne({ roomNumber: updateData.roomNumber }).session(session);
      if (existingRoom && existingRoom._id.toString() !== id) {
        throw new Error(`Another room already uses the number ${updateData.roomNumber}`);
      }
    }

    const updatedRoom = await Room.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updatedRoom) throw new Error("Room not found");

    await session.commitTransaction();

    return httpResponse(req, res, 200, "Room updated successfully", updatedRoom);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// UPDATE ROOM STATUS
// ==========================================
export const updateRoomStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const room = await Room.findById(id).session(session);
    if (!room) throw new Error("Room not found");

    room.status = status;
    await room.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Room status updated to ${status}`,
      { status: room.status }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE ROOM
// ==========================================
export const deleteRoom = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const room = await Room.findByIdAndDelete(id).session(session);
    if (!room) throw new Error("Room not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Room deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};