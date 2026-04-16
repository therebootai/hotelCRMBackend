import { z } from "zod";

const applicableDaysEnum = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

// Helper to transform single strings into arrays (fixes form-data quirks)
const arrayTransformer = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return [];
    return typeof val === "string" ? [val] : val;
  });

// ==========================================
// CREATE PRICING RULE SCHEMA
// ==========================================
export const createPricingRuleSchema = z.object({
  body: z.object({
    name: z.string({ message: "Rule name is required" }).min(2, "Name must be at least 2 characters"),
    
    roomTypes: arrayTransformer,
    roomIds: arrayTransformer,
    
    startDate: z.coerce.date({ message: "Valid Start Date is required" }),
    endDate: z.coerce.date({ message: "Valid End Date is required" }),
    
    applicableDays: z
      .union([applicableDaysEnum, z.array(applicableDaysEnum)])
      .optional()
      .transform((val) => {
        if (!val) return [];
        return typeof val === "string" ? [val] : val;
      }),
      
    adjustmentType: z.enum(["fixed_price", "percentage_increase", "flat_increase"], {
      message: "Adjustment type must be fixed_price, percentage_increase, or flat_increase",
    }),
    
    adjustmentValue: z.number({ message: "Adjustment value is required" }),
    priority: z.number().default(0),
    isActive: z.boolean().optional(),
  }).refine((data) => data.endDate >= data.startDate, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  }),
});

// ==========================================
// UPDATE PRICING RULE SCHEMA
// ==========================================
export const updatePricingRuleSchema = z.object({
  params: z.object({
    id: z.string({ message: "Pricing Rule ID is required in URL" }),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    roomTypes: arrayTransformer,
    roomIds: arrayTransformer,
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    applicableDays: z
      .union([applicableDaysEnum, z.array(applicableDaysEnum)])
      .optional()
      .transform((val) => {
        if (!val) return undefined; // Return undefined so it doesn't overwrite with empty array if not passed
        return typeof val === "string" ? [val] : val;
      }),
    adjustmentType: z.enum(["fixed_price", "percentage_increase", "flat_increase"]).optional(),
    adjustmentValue: z.number().optional(),
    priority: z.number().optional(),
    isActive: z.boolean().optional(),
  }).refine((data) => {
    // Only validate date range if BOTH dates are being updated
    if (data.startDate && data.endDate) {
      return data.endDate >= data.startDate;
    }
    return true;
  }, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  }),
});

// ==========================================
// GET ALL / TOGGLE / DELETE SCHEMA
// ==========================================
export const getAllPricingRulesSchema = z.object({
  query: z.object({
    activeOnly: z.enum(["true", "false"]).optional(),
    targetRoomId: z.string().optional(),
    targetRoomTypeId: z.string().optional(),
  }),
});

export const getOrDeletePricingRuleSchema = z.object({
  params: z.object({
    id: z.string({ message: "Pricing Rule ID is required in URL" }),
  }),
});

export const togglePricingRuleStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Pricing Rule ID is required in URL" }),
  }),
});