import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import type { UploadedFile } from "express-fileupload";
import { RoomType } from "@/api/v1/models/roomType.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";
import { deleteFile, uploadFile } from "@/api/v1/services/cloudinary.service";

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
    const { name, description } = req.body;
    let uploadedImageUrls: string[] = [];

    // Check if room type with the same name already exists
    const existingRoomType = await RoomType.findOne({ name }).session(session);
    if (existingRoomType) {
      throw new Error("A Room Type with this name already exists");
    }

    // Handle Image Uploads via express-fileupload
    if (req.files && req.files.images) {
      const files = Array.isArray(req.files.images)
        ? req.files.images
        : [req.files.images];

      const uploadPromises = files.map(async (file: UploadedFile) => {
        const uploadResult = await uploadFile(
          file.tempFilePath,
          "room-types",
          file.mimetype
        );
        if (uploadResult instanceof Error) {
          throw new Error(`Failed to upload image: ${file.name}`);
        }
        return uploadResult.secure_url;
      });

      uploadedImageUrls = await Promise.all(uploadPromises);
    }

    const newRoomType = new RoomType({
      name,
      description,
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
    const { name, description, imagesToRemove } = req.body; 

    const roomType = await RoomType.findById(id).session(session);
    if (!roomType) throw new Error("Room Type not found");

    if (imagesToRemove && Array.isArray(imagesToRemove)) {
      for (const publicId of imagesToRemove) {
        await deleteFile(publicId);
        roomType.images = roomType.images.filter(img => img.public_id !== publicId);
      }
    }

    if (req.files && req.files.images) {
      const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      
      const uploadPromises = files.map(async (file: UploadedFile) => {
        const result = await uploadFile(file.tempFilePath, "room-types", file.mimetype);
        if (result instanceof Error) throw result;
        return { url: result.secure_url, public_id: result.public_id };
      });

      const newImages = await Promise.all(uploadPromises);
      roomType.images.push(...newImages);
    }

    if (name) roomType.name = name;
    if (description !== undefined) roomType.description = description;

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

    if (roomType.images && roomType.images.length > 0) {
      const deletePromises = roomType.images.map(img => deleteFile(img.public_id));
      await Promise.all(deletePromises);
    }

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