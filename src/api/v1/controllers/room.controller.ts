import { Response, NextFunction, Request } from "express";
import mongoose from "mongoose";
import { Room } from "@/api/v1/models/room.model";
import { RoomType } from "@/api/v1/models/roomType.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";
import { Booking } from "../models/booking.model";
import { CheckIn } from "../models/checkin.model";
import { FacilityBooking } from "../models/facilityBooking.model";

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

    const roomType = await RoomType.findById(roomData.roomType).session(session);
    roomData.basePrice = roomType?.basePrice ?? 0;

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
    const { page = "1", limit = "10", status, roomType, building, availableOnly } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const filter: any = {};
    if (status) filter.status = status;
    if (roomType) filter.roomType = roomType;
    if (building) filter.building = building;

    if (availableOnly === 'true') {
      const activeCheckIns = await CheckIn.find({ status: "Active" }).select("roomDetails.roomId");
      const occupiedRoomIds = new Set<string>();
      activeCheckIns.forEach(ci => {
        if (ci.roomDetails) {
          ci.roomDetails.forEach(rd => {
            if (rd.roomId) occupiedRoomIds.add(rd.roomId.toString());
          });
        }
      });
      if (occupiedRoomIds.size > 0) {
        filter._id = { $nin: Array.from(occupiedRoomIds).map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    // Fetch data and total count concurrently for better performance
    const [rooms, totalCount] = await Promise.all([
      Room.find(filter)
        .populate("roomType", "name basePrice")
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
        .populate("roomType", "name description images basePrice")
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

    if (updateData.roomType) {
      const roomType = await RoomType.findById(updateData.roomType).session(session);
      updateData.basePrice = roomType?.basePrice ?? 0;
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

interface AvailabilityQuery {
  roomType: string;
  checkIn: string;
  checkOut: string;
}
export const getAvailableRooms = async (
  req: Request<{}, {}, {}, AvailabilityQuery>,
  res: Response
) => {
  try {
    const { roomType, checkIn, checkOut } = req.query;

    if (!roomType || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters",
      });
    }

    const startDate = new Date(checkIn as string);
    const endDate = new Date(checkOut as string);

    const busyBookings = await Booking.find({
      status: {
        $in: ["Pending", "Confirmed", "Checked-In", "Partially Checked-In"],
      },
      rooms: {
        $elemMatch: {
          checkInDate: { $lt: endDate },
          checkOutDate: { $gt: startDate },
        },
      },
    }).select("rooms");

    const busyCheckIns = await CheckIn.find({
      status: "Active",
      checkInTime: { $lt: endDate },
      expectedCheckOutTime: { $gt: startDate },
    }).select("roomDetails");

    const busyFacilityBookings = await FacilityBooking.find({
      status: { $in: ["Reserved", "Confirmed"] },
      bookedRooms: {
        $elemMatch: {
          checkInDate: { $lt: endDate },
          checkOutDate: { $gt: startDate },
          status: { $ne: "Cancelled" },
        },
      },
    }).select("bookedRooms");

    const busyRoomIds = new Set<string>();

    busyBookings.forEach((booking: any) => {
      booking.rooms.forEach((room: any) => {
        if (
          room.roomId &&
          new Date(room.checkInDate) < endDate &&
          new Date(room.checkOutDate) > startDate
        ) {
          busyRoomIds.add(room.roomId.toString());
        }
      });
    });

    busyCheckIns.forEach((checkin: any) => {
      checkin.roomDetails?.forEach((room: any) => {
        if (room.roomId) {
          busyRoomIds.add(room.roomId.toString());
        }
      });
    });

    busyFacilityBookings.forEach((facility: any) => {
      facility.bookedRooms?.forEach((room: any) => {
        if (
          room.roomId &&
          room.status !== "Cancelled" &&
          (!room.checkInDate || new Date(room.checkInDate) < endDate) &&
          (!room.checkOutDate || new Date(room.checkOutDate) > startDate)
        ) {
          busyRoomIds.add(room.roomId.toString());
        }
      });
    });

    const availableRooms = await Room.find({
      status: "Active",
      roomType,
      _id: { $nin: Array.from(busyRoomIds) },
    }).populate("roomType", "name basePrice");

    return res.status(200).json({
      success: true,
      data: {
        rooms: availableRooms,
        totalFound: availableRooms.length,
      },
    });
  } catch (error: any) {
    console.error("getAvailableRooms Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};