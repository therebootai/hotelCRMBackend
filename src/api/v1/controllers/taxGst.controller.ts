import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { TaxGst } from "@/api/v1/models/taxGst.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE TAX/GST
// ==========================================
export const createTaxGst = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Now destructuring isActive
    const { name, percentage, type, isActive } = req.body;

    // 2. Add Duplicate Name Check
    const existingTax = await TaxGst.findOne({ name }).session(session);
    if (existingTax) {
      throw new Error("A Tax/GST configuration with this name already exists");
    }

    // 3. Pass isActive (falls back to undefined, which triggers Mongoose's default: true)
    const newTax = new TaxGst({ name, percentage, type, isActive });
    await newTax.save({ session });

    await session.commitTransaction();

    return httpResponse(req, res, 201, "Tax/GST configuration created successfully", newTax);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL TAX/GST CONFIGURATIONS
// ==========================================
export const getAllTaxGsts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { activeOnly, type } = req.query;
    
    // Build dynamic filter
    const filter: any = {};
    if (activeOnly === "true") filter.isActive = true;
    if (type) filter.type = type;

    const taxes = await TaxGst.find(filter).sort({ createdAt: -1 });

    return httpResponse(
      req,
      res,
      200,
      "Tax/GST configurations fetched successfully",
      taxes
    );
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET TAX/GST BY ID
// ==========================================
export const getTaxGstById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const tax = await TaxGst.findById(id);

    if (!tax) throw new Error("Tax/GST configuration not found");

    return httpResponse(
      req,
      res,
      200,
      "Tax/GST configuration fetched successfully",
      tax
    );
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE TAX/GST
// ==========================================
export const updateTaxGst = async (
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
      const existingTax = await TaxGst.findOne({ name: updateData.name }).session(session);
      
      if (existingTax && existingTax._id.toString() !== id) {
        throw new Error("Another Tax/GST configuration with this name already exists");
      }
    }

    const updatedTax = await TaxGst.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updatedTax) throw new Error("Tax/GST configuration not found");

    await session.commitTransaction();

    return httpResponse(req, res, 200, "Tax/GST configuration updated successfully", updatedTax);
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
export const toggleTaxGstStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const tax = await TaxGst.findById(id).session(session);
    if (!tax) throw new Error("Tax/GST configuration not found");

    tax.isActive = !tax.isActive;
    await tax.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Tax/GST status toggled to ${tax.isActive ? 'Active' : 'Inactive'}`,
      { isActive: tax.isActive }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE TAX/GST
// ==========================================
export const deleteTaxGst = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const tax = await TaxGst.findById(id).session(session);
    if (!tax) throw new Error("Tax/GST configuration not found");

    const inUse = await mongoose.model("RoomType").findOne({ gstId: id }).session(session);
    if (inUse) {
      throw new Error("Cannot delete this tax because it is currently assigned to one or more Room Categories. Please reassign those categories first.");
    }

    await TaxGst.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Tax/GST configuration deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};