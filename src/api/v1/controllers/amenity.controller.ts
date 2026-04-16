import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Amenity } from "@/api/v1/models/amenity.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE AMENITY
// ==========================================
export const createAmenity = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, icon, isActive } = req.body;

    const existingAmenity = await Amenity.findOne({ name }).session(session);
    if (existingAmenity) {
      throw new Error("An Amenity with this name already exists");
    }

    const newAmenity = new Amenity({ name, icon, isActive });
    await newAmenity.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Amenity created successfully",
      newAmenity
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL AMENITIES
// ==========================================
export const getAllAmenities = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { activeOnly } = req.query;
    
    const filter: any = {};
    if (activeOnly === "true") filter.isActive = true;

    const amenities = await Amenity.find(filter).sort({ createdAt: -1 });

    return httpResponse(
      req,
      res,
      200,
      "Amenities fetched successfully",
      amenities
    );
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// UPDATE AMENITY
// ==========================================
export const updateAmenity = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.name) {
      const existingAmenity = await Amenity.findOne({ name: updateData.name }).session(session);
      if (existingAmenity && existingAmenity._id.toString() !== id) {
        throw new Error("Another Amenity with this name already exists");
      }
    }

    const updatedAmenity = await Amenity.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updatedAmenity) throw new Error("Amenity not found");

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      "Amenity updated successfully",
      updatedAmenity
    );
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
export const toggleAmenityStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const amenity = await Amenity.findById(id).session(session);
    if (!amenity) throw new Error("Amenity not found");

    amenity.isActive = !amenity.isActive;
    await amenity.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Amenity status toggled to ${amenity.isActive ? 'Active' : 'Inactive'}`,
      { isActive: amenity.isActive }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE AMENITY
// ==========================================
export const deleteAmenity = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const amenity = await Amenity.findByIdAndDelete(id).session(session);
    if (!amenity) throw new Error("Amenity not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Amenity deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};