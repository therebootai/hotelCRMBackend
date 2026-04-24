import { z } from "zod";

// ==========================================
// CREATE FACILITY SCHEMA
// ==========================================
export const createFacilitySchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Facility name is required and must be a string" })
      .min(3, "Facility name must be at least 3 characters"),

    type: z.enum(
      [
        "Marriage Hall",
        "Banquet Hall",
        "Conference Hall",
        "Pool",
        "Lawn",
        "Rooftop",
        "Other",
      ],
      {
        message: "Valid facility type is required",
      }
    ),

    capacity: z
      .number({ message: "Capacity is required and must be a number" })
      .min(1, "Capacity must be at least 1"),

    pricingType: z
      .enum(["Hourly", "Slot", "Full Day"], {
        message: "Pricing type must be 'Hourly', 'Slot', or 'Full Day'",
      })
      .optional(),

    basePrice: z
      .number({ message: "Base price is required and must be a number" })
      .min(0, "Base price cannot be negative"),

    amenities: z
      .array(z.string({ message: "Amenity ID must be a valid string" }))
      .optional(),

    description: z
      .string({ message: "Description must be a string" })
      .optional(),

    status: z
      .enum(["Active", "Maintenance", "Blocked"], {
        message: "Status must be 'Active', 'Maintenance', or 'Blocked'",
      })
      .optional(), // Optional because Mongoose sets a default
  }),
});

// ==========================================
// UPDATE FACILITY SCHEMA
// ==========================================
export const updateFacilitySchema = z.object({
  params: z.object({
    id: z.string({ message: "Facility ID is required in URL" }),
  }),
  body: z
    .object({
      name: z.string().min(3).optional(),
      type: z
        .enum([
          "Marriage Hall",
          "Banquet Hall",
          "Conference Hall",
          "Pool",
          "Lawn",
          "Rooftop",
          "Other",
        ])
        .optional(),
      capacity: z.number().min(1).optional(),
      pricingType: z.enum(["Hourly", "Slot", "Full Day"]).optional(),
      basePrice: z.number().min(0).optional(),
      amenities: z.array(z.string()).optional(),
      description: z.string().optional(),
      status: z.enum(["Active", "Maintenance", "Blocked"]).optional(),
    })
    .strict(),
});

// ==========================================
// TOGGLE FACILITY STATUS SCHEMA
// ==========================================
export const toggleFacilityStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "Facility ID is required in URL" }),
  }),
});

// ==========================================
// GET FACILITY BY ID SCHEMA
// ==========================================
export const getFacilityByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Facility ID is required in URL" }),
  }),
});

// ==========================================
// DELETE FACILITY SCHEMA
// ==========================================
export const deleteFacilitySchema = z.object({
  params: z.object({
    id: z.string({ message: "Facility ID is required in URL" }),
  }),
});