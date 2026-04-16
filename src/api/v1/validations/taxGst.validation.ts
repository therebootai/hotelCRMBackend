import { z } from "zod";

// ==========================================
// CREATE TAX/GST SCHEMA
// ==========================================
export const createTaxGstSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Tax/GST name is required" })
      .min(2, "Name must be at least 2 characters"),
    
    percentage: z
      .number({ message: "Percentage is required and must be a number" })
      .min(0, "Percentage cannot be negative")
      .max(100, "Percentage cannot exceed 100"),
    
    type: z.enum(["Room", "Food", "Service"], {
      message: "Type must be 'Room', 'Food', or 'Service'",
    }),
    isActive: z.boolean().optional(),
  }),
});

// ==========================================
// GET ALL TAX/GST SCHEMA
// ==========================================

export const getAllTaxGstsSchema = z.object({
  query: z.object({
    activeOnly: z.enum(["true", "false"]).optional(),
    type: z.enum(["Room", "Food", "Service"]).optional(),
  }),
});

// ==========================================
// UPDATE TAX/GST SCHEMA
// ==========================================
export const updateTaxGstSchema = z.object({
  params: z.object({
    id: z.string({ message: "Tax/GST ID is required in URL" }),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      percentage: z.number().min(0).max(100).optional(),
      type: z.enum(["Room", "Food", "Service"]).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

// ==========================================
// TOGGLE STATUS SCHEMA
// ==========================================
export const toggleTaxGstStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Tax/GST ID is required in URL" }),
  }),
});

// ==========================================
// GET BY ID SCHEMA
// ==========================================
export const getTaxGstByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Tax/GST ID is required in URL" }),
  }),
});

// ==========================================
// DELETE SCHEMA
// ==========================================
export const deleteTaxGstSchema = z.object({
  params: z.object({
    id: z.string({ message: "Tax/GST ID is required in URL" }),
  }),
});