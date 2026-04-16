import { z } from "zod";

// ==========================================
// CREATE AMENITY SCHEMA
// ==========================================
export const createAmenitySchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Amenity name is required" })
      .min(2, "Name must be at least 2 characters"),
    
    icon: z
      .string({ message: "Icon identifier is required" })
      .min(1, "Icon identifier cannot be empty"),
      
    isActive: z.boolean().optional(),
  }),
});

// ==========================================
// UPDATE AMENITY SCHEMA
// ==========================================
export const updateAmenitySchema = z.object({
  params: z.object({
    id: z.string({ message: "Amenity ID is required in URL" }),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      icon: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

// ==========================================
// GET ALL AMENITIES SCHEMA
// ==========================================
export const getAllAmenitiesSchema = z.object({
  query: z.object({
    activeOnly: z.enum(["true", "false"]).optional(),
  }),
});

// ==========================================
// TOGGLE STATUS SCHEMA
// ==========================================
export const toggleAmenityStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Amenity ID is required in URL" }),
  }),
});

// ==========================================
// DELETE AMENITY SCHEMA
// ==========================================
export const deleteAmenitySchema = z.object({
  params: z.object({
    id: z.string({ message: "Amenity ID is required in URL" }),
  }),
});