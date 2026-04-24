import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Facility } from "@/api/v1/models/facility.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE FACILITY
// ==========================================
export const createFacility = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, type, capacity, pricingType, basePrice, amenities, description, status } = req.body;

    // Check for unique name
    const existingFacility = await Facility.findOne({ name }).session(session);
    if (existingFacility) {
      throw new Error("Facility with this name already exists");
    }

    const newFacility = new Facility({
      name,
      type,
      capacity,
      pricingType,
      basePrice,
      amenities,
      description,
      status
    });

    await newFacility.save({ session });
    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Facility created successfully",
      newFacility,
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET FACILITY BY ID
// ==========================================
export const getFacilityById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    
    // Populating amenities if you need the full nested data
    const facility = await Facility.findById(id).populate("amenities");

    if (!facility) throw new Error("Facility not found");

    return httpResponse(req, res, 200, "Facility fetched successfully", facility);
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// GET ALL FACILITIES
// ==========================================
export const getFacilities = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Populating amenities if you need the full nested data
    const facilities = await Facility.find({}).populate("amenities");
    
    return httpResponse(req, res, 200, "Facilities fetched successfully", facilities);
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// UPDATE FACILITY
// ==========================================
export const updateFacility = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent duplicate name errors during update
    if (updateData.name) {
      const existingFacility = await Facility.findOne({ 
        name: updateData.name, 
        _id: { $ne: id } 
      }).session(session);
      
      if (existingFacility) {
        throw new Error("Another facility with this name already exists");
      }
    }

    const updatedFacility = await Facility.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    }).populate("amenities");

    if (!updatedFacility) throw new Error("Facility not found");

    await session.commitTransaction();
    return httpResponse(
      req,
      res,
      200,
      "Facility updated successfully",
      updatedFacility,
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
export const toggleStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const facility = await Facility.findById(id).session(session);
    if (!facility) throw new Error("Facility not found");

    // Toggle logic for string enum: flips between Active and Blocked
    facility.status = facility.status === "Active" ? "Blocked" : "Active";
    
    await facility.save({ session });
    await session.commitTransaction();

    return httpResponse(req, res, 200, "Facility status toggled successfully", {
      status: facility.status,
    });
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE FACILITY
// ==========================================
export const deleteFacility = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const deletedFacility = await Facility.findByIdAndDelete(id).session(session);
    if (!deletedFacility) throw new Error("Facility not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Facility deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};