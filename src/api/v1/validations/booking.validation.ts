import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const createBookingSchema = z.object({
  body: z.object({
    // Support both legacy (customerId + bookingContact) and new (customerDetails) formats
    customerId: objectIdSchema.optional(),
    customerDetails: z.object({
      name: z.string().min(1, "Customer name is required"),
      phone: z.string().min(10, "Phone must be at least 10 digits"),
      email: z.string().email().optional(),
      address: z.string().optional(),
    }).optional(),
    bookingCategory: z.enum(["Room Stay", "Day Access", "Event", "Banquet"]).default("Room Stay"),
    bookingType: z.enum(["Individual", "Corporate"]).default("Individual"),

    rooms: z.array(
      z.object({
        roomType: objectIdSchema,
        roomId: objectIdSchema.optional(),
        checkInDate: z.coerce.date(),
        checkOutDate: z.coerce.date(),
        adults: z.number().min(1).default(1),
        children: z.number().min(0).default(0),
        pricePerNight: z.number().min(0),
        mealPlan: z.enum(["EP", "CP", "MAP", "AP"]).optional(),
        hasExtraBed: z.boolean().optional(),
        extraBedCharge: z.number().min(0).optional(),
      })
    ).optional(),

    overallCheckInDate: z.coerce.date().optional(),
    overallCheckOutDate: z.coerce.date().optional(),

    accessPackageId: objectIdSchema.optional(),
    visitDate: z.coerce.date().optional(),

    totalAdults: z.number().min(1).default(1),
    totalChildren: z.number().min(0).default(0),
    totalGuests: z.number().min(1).optional(),
    totalRooms: z.number().min(1).optional(),

    source: z.enum([
      "Website",
      "Phone",
      "Walk-in",
      "Booking.com",
      "Agoda",
      "Goibibo",
      "MakeMyTrip",
      "Corporate",
      "Travel Agent",
    ]).default("Walk-in"),

    corporateDetails: z.object({
      companyName: z.string().min(1),
      gstNumber: z.string().optional(),
      contactPerson: z.string().min(1),
      mobile: z.string().min(10),
      email: z.string().email().optional(),
      address: z.string().optional(),
      negotiatedRate: z.number().optional(),
      companyCode: z.string().optional(),
      notes: z.string().optional(),
    }).optional(),

    mealPlan: z.enum(["EP", "CP", "MAP", "AP"]).optional(),
    advanceAmount: z.number().min(0).default(0),

    // Legacy format support — bookingContact is optional, controller derives from customerDetails
    bookingContact: z.object({
      name: z.string().min(1, "Contact name is required"),
      mobile: z.string().min(10, "Contact mobile must be at least 10 digits"),
      email: z.string().email().optional(),
    }).optional(),

    // Support adults/children at top level (inline with frontend's payload)
    adults: z.number().min(0).default(0),
    children: z.number().min(0).default(0),

    // Support paymentMode alias (frontend sends paymentMode)
    paymentMode: z.string().optional(),

    expiresAt: z.coerce.date().optional(),
    pickupRequired: z.boolean().default(false),
    specialRequests: z.string().max(500).optional(),
    internalNotes: z.string().optional(),
    vehicleDetails: z.array(z.any()).default([]),
  }).refine(
    (data) => {
      // Must have either customerId or customerDetails
      return data.customerId || data.customerDetails;
    },
    {
      message: "Either customerId or customerDetails must be provided",
      path: ["customerDetails"],
    }
  ),
});

export const updateBookingSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    status: z.enum([
      "Pending",
      "Confirmed",
      "Checked-In",
      "Checked-Out",
      "Cancelled",
      "No-Show",
    ]).optional(),
    rooms: z.array(
      z.object({
        roomType: objectIdSchema.optional(),
        roomId: objectIdSchema.optional(),
        checkInDate: z.coerce.date().optional(),
        checkOutDate: z.coerce.date().optional(),
        adults: z.number().min(1).optional(),
        children: z.number().min(0).optional(),
        pricePerNight: z.number().min(0).optional(),
        mealPlan: z.enum(["EP", "CP", "MAP", "AP"]).optional(),
        hasExtraBed: z.boolean().optional(),
        extraBedCharge: z.number().min(0).optional(),
      })
    ).optional(),
    overallCheckOutDate: z.coerce.date().optional(),
    advanceAmount: z.number().min(0).optional(),
    specialRequests: z.string().max(500).optional(),
  }).strict(),
});

export const cancelBookingSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    reason: z.string().min(5, "Cancellation reason must be at least 5 characters"),
    refundAmount: z.number().min(0).optional(),
  }),
});

export const getBookingByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
