import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PricingRule } from "@/api/v1/models/pricingRule.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";

// ==========================================
// CREATE PRICING RULE
// ==========================================
export const createPricingRule = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ruleData = req.body;

    // Check if a rule with this exact name already exists to prevent confusion
    const existingRule = await PricingRule.findOne({ name: ruleData.name }).session(session);
    if (existingRule) {
      throw new Error(`A pricing rule named "${ruleData.name}" already exists`);
    }

    const newRule = new PricingRule(ruleData);
    await newRule.save({ session });

    await session.commitTransaction();

    return httpResponse(req, res, 201, "Pricing rule created successfully", newRule);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// GET ALL PRICING RULES
// ==========================================
export const getAllPricingRules = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { activeOnly, targetRoomId, targetRoomTypeId } = req.query;

    const filter: any = {};
    if (activeOnly === "true") filter.isActive = true;
    
    if (targetRoomId) filter.roomIds = targetRoomId;
    
    if (targetRoomTypeId) filter.roomTypes = targetRoomTypeId;

    const rules = await PricingRule.find(filter)
      .populate("roomTypes", "name")
      .populate("roomIds", "roomNumber")
      .sort({ priority: -1, startDate: 1 }); // Highest priority first, then chronological

    return httpResponse(req, res, 200, "Pricing rules fetched successfully", rules);
  } catch (error) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET PRICING RULE BY ID
// ==========================================
export const getPricingRuleById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    
    const rule = await PricingRule.findById(id)
      .populate("roomTypes", "name")
      .populate("roomIds", "roomNumber");

    if (!rule) throw new Error("Pricing rule not found");

    return httpResponse(req, res, 200, "Pricing rule fetched successfully", rule);
  } catch (error) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE PRICING RULE
// ==========================================
export const updatePricingRule = async (
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
      const existingRule = await PricingRule.findOne({ name: updateData.name }).session(session);
      if (existingRule && existingRule._id.toString() !== id) {
        throw new Error(`Another pricing rule named "${updateData.name}" already exists`);
      }
    }

    const updatedRule = await PricingRule.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updatedRule) throw new Error("Pricing rule not found");

    await session.commitTransaction();

    return httpResponse(req, res, 200, "Pricing rule updated successfully", updatedRule);
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// TOGGLE PRICING RULE STATUS
// ==========================================
export const togglePricingRuleStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    
    const rule = await PricingRule.findById(id).session(session);
    if (!rule) throw new Error("Pricing rule not found");

    rule.isActive = !rule.isActive;
    await rule.save({ session });

    await session.commitTransaction();

    return httpResponse(
      req,
      res,
      200,
      `Pricing rule status toggled to ${rule.isActive ? 'Active' : 'Inactive'}`,
      { isActive: rule.isActive }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// DELETE PRICING RULE
// ==========================================
export const deletePricingRule = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    const rule = await PricingRule.findByIdAndDelete(id).session(session);
    if (!rule) throw new Error("Pricing rule not found");

    await session.commitTransaction();
    return httpResponse(req, res, 200, "Pricing rule deleted successfully");
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};