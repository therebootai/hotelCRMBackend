import { z } from "zod";

// ==========================================
// CREATE ROOM TYPE SCHEMA
// ==========================================
export const createRoomTypeSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Room Type name is required" })
      .min(2, "Name must be at least 2 characters"),

    description: z
      .string()
      .optional(),

    basePrice: z
      .number()
      .min(0, "Price cannot be negative"),

  }),
});

// ==========================================
// UPDATE ROOM TYPE SCHEMA
// ==========================================
export const updateRoomTypeSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room Type ID is required in URL" }),
  }),
  body: z.object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .optional(),

    description: z
      .string()
      .optional(),

    basePrice: z
      .number()
      .min(0, "Price cannot be negative")
      .optional(),
  }),
});

// ==========================================
// TOGGLE ROOM TYPE STATUS SCHEMA
// ==========================================
export const toggleRoomTypeStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room Type ID is required in URL" }),
  }),
});

// ==========================================
// GET ROOM TYPE BY ID SCHEMA
// ==========================================
export const getRoomTypeByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room Type ID is required in URL" }),
  }),
});

// ==========================================
// DELETE ROOM TYPE SCHEMA
// ==========================================
export const deleteRoomTypeSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room Type ID is required in URL" }),
  }),
});