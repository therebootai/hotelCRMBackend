import { z } from "zod";

// ==========================================
// CREATE ROOM SCHEMA
// ==========================================
export const createRoomSchema = z.object({
  body: z.object({
    roomNumber: z.string({ message: "Room number is required" }).min(1),
    roomType: z.string({ message: "Room Type ID is required" }),
    building: z.string().optional(),
    floor: z.string().optional(),
    
    maxAdults: z.number().min(1, "At least 1 adult is required"),
    maxChildren: z.number().min(0),
    extraBedAllowed: z.boolean().default(false),
    extraBedCharge: z.number().min(0).optional(),

    gstId: z.string().optional(),
    
    roomSize: z.number().min(1).optional(),
    viewType: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    description: z.string().optional(),
    
    status: z.enum(["Active", "Maintenance", "Blocked"]).optional(),
  }),
});

// ==========================================
// UPDATE ROOM SCHEMA
// ==========================================
export const updateRoomSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room ID is required in URL" }),
  }),
  body: z.object({
    roomNumber: z.string().min(1).optional(),
    roomType: z.string().optional(),
    building: z.string().optional(),
    floor: z.string().optional(),
    maxAdults: z.number().min(1).optional(),
    maxChildren: z.number().min(0).optional(),
    extraBedAllowed: z.boolean().optional(),
    extraBedCharge: z.number().min(0).optional(),
    gstId: z.string().optional(),
    roomSize: z.number().min(1).optional(),
    viewType: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    description: z.string().optional(),
    status: z.enum(["Active", "Maintenance", "Blocked"]).optional(),
  }).strict(),
});

// ==========================================
// GET ALL ROOMS SCHEMA (Pagination & Filters)
// ==========================================
export const getAllRoomsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    status: z.enum(["Active", "Maintenance", "Blocked"]).optional(),
    roomType: z.string().optional(),
    building: z.string().optional(),
  }),
});

// ==========================================
// UPDATE STATUS SCHEMA
// ==========================================
export const updateRoomStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room ID is required in URL" }),
  }),
  body: z.object({
    status: z.enum(["Active", "Maintenance", "Blocked"], {
      message: "Status must be 'Active', 'Maintenance', or 'Blocked'",
    }),
  }),
});

// ==========================================
// GET / DELETE BY ID SCHEMA
// ==========================================
export const getOrDeleteRoomSchema = z.object({
  params: z.object({
    id: z.string({ message: "Room ID is required in URL" }),
  }),
});