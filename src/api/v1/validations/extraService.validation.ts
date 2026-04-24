import { z } from "zod";

// ==========================================
// CREATE EXTRA SERVICE SCHEMA
// ==========================================
export const createExtraServiceSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Extra Service name is required" })
      .min(2, "Name must be at least 2 characters"),
      
    isActive: z.boolean().optional(),
  }),
});

// ==========================================
// UPDATE EXTRA SERVICE SCHEMA
// ==========================================
export const updateExtraServiceSchema = z.object({
  params: z.object({
    id: z.string({ message: "Extra Service ID is required in URL" }),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

// ==========================================
// GET ALL EXTRA SERVICES SCHEMA
// ==========================================
export const getAllExtraServicesSchema = z.object({
  query: z.object({
    activeOnly: z.enum(["true", "false"]).optional(),
  }),
});

// ==========================================
// TOGGLE STATUS SCHEMA
// ==========================================
export const toggleExtraServiceStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Extra Service ID is required in URL" }),
  }),
});

// ==========================================
// DELETE EXTRA SERVICE SCHEMA
// ==========================================
export const deleteExtraServiceSchema = z.object({
  params: z.object({
    id: z.string({ message: "Extra Service ID is required in URL" }),
  }),
});