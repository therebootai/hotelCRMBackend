import { z } from "zod";

// ==========================================
// 1. BULK UPSERT PRICING RATES
// ==========================================
export const bulkUpsertPricingRulesSchema = z.object({
  body: z.object({
    rates: z.array(
      z.object({
        roomId: z.string({ message: "roomId is required" }),
        date: z.coerce.date({ message: "Valid date is required" }),
        price: z.number({ message: "price is required" }).min(0, "Price cannot be negative"),
      })
    ).min(1, "The 'rates' array cannot be empty"),
  }),
});

// ==========================================
// 2. GET PRICING RULES BY DATE RANGE
// ==========================================
export const getPricingRulesByDateRangeSchema = z.object({
  query: z.object({
    startDate: z.coerce.date({ message: "startDate is required" }),
    endDate: z.coerce.date({ message: "endDate is required" }),
    roomId: z.string().optional(),
  }).refine((data) => data.endDate >= data.startDate, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  }),
});

// ==========================================
// 3. GET RATES FOR A SPECIFIC ROOM
// ==========================================
export const getRoomRatesSchema = z.object({
  params: z.object({
    roomId: z.string({ message: "roomId param is required in the URL" }),
  }),
  query: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }).refine((data) => {
    if (data.startDate && data.endDate) {
      return data.endDate >= data.startDate;
    }
    return true;
  }, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  }),
});

// ==========================================
// 4. GET EXACT PRICE FOR ROOM & DATE
// ==========================================
export const getPriceForRoomAndDateSchema = z.object({
  params: z.object({
    roomId: z.string({ message: "roomId param is required in the URL" }),
  }),
  query: z.object({
    date: z.coerce.date({ message: "date query parameter is required" }),
  }),
});

// ==========================================
// GET RATE MANAGEMENT GRID
// ==========================================
export const getRateManagementGridSchema = z.object({
  query: z.object({
    startDate: z.coerce.date({ message: "startDate is required" }),
    endDate: z.coerce.date({ message: "endDate is required" }),
  }).refine((data) => data.endDate >= data.startDate, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  }),
});