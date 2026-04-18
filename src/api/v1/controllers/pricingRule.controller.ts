import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PricingRule } from "@/api/v1/models/pricingRule.model";
import { httpError } from "@/api/v1/utils/httpError";
import httpResponse from "@/api/v1/utils/httpResponse";
import { AuthRequest } from "@/api/v1/interfaces/auth";
import { Room } from "../models/room.model";

// ==========================================
// 1. BULK UPSERT PRICING RATES (Add/Update)
// ==========================================
export const bulkUpsertPricingRules = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Expected payload: { rates: [{ roomId: "...", date: "YYYY-MM-DD", price: 5000 }, ...] }
    const { rates } = req.body;

    if (!Array.isArray(rates) || rates.length === 0) {
      throw new Error("Invalid payload: 'rates' array is required");
    }

    // Map the incoming array to MongoDB bulkWrite operations
    const bulkOperations = rates.map((rate: { roomId: string; date: string | Date; price: number }) => {
      // Normalize date to start of day in UTC to prevent timezone drifting
      const normalizedDate = new Date(rate.date);
      normalizedDate.setUTCHours(0, 0, 0, 0);

      return {
        updateOne: {
          // Find by roomId and exact date
          filter: { 
            roomId: rate.roomId, 
            date: normalizedDate 
          },
          // Set the new price
          update: { 
            $set: { price: rate.price } 
          },
          // If it doesn't exist, create it (Upsert)
          upsert: true,
        },
      };
    });

    // Execute all operations in one database call
    const result = await PricingRule.bulkWrite(bulkOperations, { session });

    await session.commitTransaction();

    return httpResponse(
      req, 
      res, 
      200, 
      "Rates updated successfully", 
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount
      }
    );
  } catch (error) {
    await session.abortTransaction();
    return httpError(next, error, req, 400);
  } finally {
    session.endSession();
  }
};

// ==========================================
// 2. GET PRICING RULES BY DATE RANGE
// ==========================================
// we need this so the frontend can populate the 7/10 day table view
export const getPricingRulesByDateRange = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { startDate, endDate, roomId } = req.query;

    if (!startDate || !endDate) {
      throw new Error("startDate and endDate are required");
    }

    const start = new Date(startDate as string);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate as string);
    end.setUTCHours(23, 59, 59, 999);

    // Build filter object
    const filter: any = {
      date: {
        $gte: start,
        $lte: end,
      },
    };

    // Optionally filter by a specific room if requested
    if (roomId) {
      filter.roomId = roomId;
    }

    const rules = await PricingRule.find(filter)
      .select("roomId date price -_id") // Only fetch what we need to save bandwidth
      .lean(); // Returns plain JS objects (faster)

    return httpResponse(req, res, 200, "Pricing rules fetched successfully", rules);
  } catch (error) {
    return httpError(next, error, req, 400);
  }
};


// ==========================================
// GET RATES FOR A SPECIFIC ROOM
// ==========================================
export const getRoomRates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { roomId } = req.params;
    const { startDate, endDate } = req.query;

    // Default to the next 30 days if no dates are provided
    const start = startDate ? new Date(startDate as string) : new Date();
    start.setUTCHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate as string) : new Date(start);
    if (!endDate) end.setDate(end.getDate() + 30);
    end.setUTCHours(23, 59, 59, 999);

    const rates = await PricingRule.find({
      roomId,
      date: {
        $gte: start,
        $lte: end,
      },
    })
      .select("date price -_id")
      .sort({ date: 1 }) // Sort chronologically
      .lean();

    return httpResponse(req, res, 200, "Room rates fetched successfully", rates);
  } catch (error) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET EXACT PRICE FOR ROOM & DATE
// ==========================================
export const getPriceForRoomAndDate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { roomId } = req.params;
    const { date } = req.query;

    if (!date) {
      throw new Error("Date query parameter is required (YYYY-MM-DD)");
    }

    // Normalize the date to match the DB
    const targetDate = new Date(date as string);
    targetDate.setUTCHours(0, 0, 0, 0);

    const rule = await PricingRule.findOne({
      roomId,
      date: targetDate,
    }).lean();

    // If no specific rule exists, you might want to return a default base price 
    // from the Room model, but for now we just return the rule or null.
    return httpResponse(
      req, 
      res, 
      200, 
      "Price fetched successfully", 
      rule ? { price: rule.price } : { price: null } 
    );
  } catch (error) {
    return httpError(next, error, req, 400);
  }
};


// ==========================================
// GET RATE MANAGEMENT GRID PAYLOAD
// ==========================================
export const getRateManagementGrid = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new Error("startDate and endDate are required");
    }

    const start = new Date(startDate as string);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate as string);
    end.setUTCHours(23, 59, 59, 999);

    // 1. Fetch all Active Rooms populated with their Room Type
    // We only need the ID, roomNumber, basePrice, and roomType info
    const rooms = await Room.find({ status: { $ne: "Blocked" } })
      .populate("roomType", "name")
      .select("roomNumber basePrice roomType")
      .lean();

    // Group the rooms by category for the frontend UI
    const categoriesMap = new Map();

    rooms.forEach((room: any) => {
      if (!room.roomType) return;
      
      const typeId = room.roomType._id.toString();
      
      if (!categoriesMap.has(typeId)) {
        categoriesMap.set(typeId, {
          id: typeId,
          name: room.roomType.name,
          rooms: [],
        });
      }

      categoriesMap.get(typeId).rooms.push({
        id: room._id.toString(),
        roomNumber: room.roomNumber,
        basePrice: room.basePrice,
      });
    });

    const categories = Array.from(categoriesMap.values());

    // 2. Fetch all Pricing Rules (Overrides) for this date range
    const overrides = await PricingRule.find({
      date: {
        $gte: start,
        $lte: end,
      },
    })
      .select("roomId date price -_id")
      .lean();

    // 👇 UPDATE THIS MAPPING BLOCK 👇
    const formattedOverrides = overrides.map(rule => {
      // Ensure it's a valid Date object before formatting
      const dateObj = new Date(rule.date); 
      
      return {
        roomId: rule.roomId.toString(),
        // .split("T") isolates the "YYYY-MM-DD" part and drops the time/array
        date: dateObj.toISOString().split("T"), 
        price: rule.price
      };
    });

    return httpResponse(req, res, 200, "Grid payload fetched successfully", {
      categories,
      overrides: formattedOverrides,
    });
  } catch (error) {
    return httpError(next, error, req, 400);
  }
};