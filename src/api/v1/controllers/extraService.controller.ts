import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { ExtraService } from "@/api/v1/models/extraService.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE EXTRA SERVICE
// ==========================================
export const createExtraService = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { name, price, isActive } = req.body;

    const existingService = await ExtraService.findOne({ name }).session(session);
    if (existingService) {
      throw new Error("An Extra Service with this name already exists");
    }

    const newService = new ExtraService({ name, price, isActive });
    await newService.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      201,
      "Extra Service created successfully",
      newService
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL EXTRA SERVICES
// ==========================================
export const getAllExtraServices = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { activeOnly } = req.query;
    
    const filter: any = {};
    if (activeOnly === "true") filter.isActive = true;

    const services = await ExtraService.find(filter).sort({ createdAt: -1 });

    return httpResponse(
      req,
      res,
      200,
      "Extra Services fetched successfully",
      services
    );
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// UPDATE EXTRA SERVICE
// ==========================================
export const updateExtraService = async (
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
      const existingService = await ExtraService.findOne({ name: updateData.name }).session(session);
      if (existingService && existingService._id.toString() !== id) {
        throw new Error("Another Extra Service with this name already exists");
      }
    }

    const updatedService = await ExtraService.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updatedService) throw new Error("Extra Service not found");

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      "Extra Service updated successfully",
      updatedService
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
export const toggleExtraServiceStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const service = await ExtraService.findById(id).session(session);
    if (!service) throw new Error("Extra Service not found");

    service.isActive = !service.isActive;
    await service.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Extra Service status toggled to ${service.isActive ? 'Active' : 'Inactive'}`,
      { isActive: service.isActive }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE EXTRA SERVICE
// ==========================================
export const deleteExtraService = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const service = await ExtraService.findByIdAndDelete(id).session(session);
    if (!service) throw new Error("Extra Service not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Extra Service deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};