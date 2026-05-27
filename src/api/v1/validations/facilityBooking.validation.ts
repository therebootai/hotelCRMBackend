import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const createFacilityBookingSchema = z.object({
  body: z.object({
    facilityId: objectIdSchema,
    customerId: objectIdSchema,
    eventType: z.enum([
      "Wedding",
      "Reception",
      "Birthday",
      "Corporate Meeting",
      "Pool Party",
      "Conference",
      "Other",
    ]),
    eventStartDate: z.coerce.date(),
    eventEndDate: z.coerce.date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be in HH:mm format").optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time must be in HH:mm format").optional(),
    totalGuests: z.number().min(1, "Guest count must be at least 1"),
    baseAmount: z.number().min(0, "Base amount cannot be negative"),
    bookingId: objectIdSchema.optional(),
    bookedRooms: z.array(
      z.object({
        roomId: objectIdSchema,
        roomType: objectIdSchema.optional(),
        checkInDate: z.coerce.date().optional(),
        checkOutDate: z.coerce.date().optional(),
        nights: z.number().min(1).optional(),
        adults: z.number().min(1).optional(),
        children: z.number().min(0).optional(),
        ratePerNight: z.number().min(0).default(0),
        totalAmount: z.number().min(0).default(0),
        requiresCheckIn: z.boolean().default(false),
        status: z.enum(["Reserved", "Checked-In", "Checked-Out", "Cancelled"]).default("Reserved"),
      })
    ).optional(),
    totalRoomAmount: z.number().min(0).optional(),
    decorationCharge: z.number().min(0).optional(),
    cateringCharge: z.number().min(0).optional(),
    soundCharge: z.number().min(0).optional(),
    miscCharge: z.number().min(0).optional(),
    advanceAmount: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    finalAmount: z.number().min(0).optional(),
    status: z.enum(["Reserved", "Confirmed", "Completed", "Cancelled"]).default("Reserved"),
    notes: z.string().optional(),
    
    // Support the custom fields mentioned in the PLAN.md if they differ:
    bookingDate: z.coerce.date().optional(),
    guestCount: z.number().min(1).optional(),
    contactPerson: z.string().optional(),
    contactMobile: z.string().optional(),
  }),
});

export const updateFacilityBookingSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    facilityId: objectIdSchema.optional(),
    customerId: objectIdSchema.optional(),
    eventType: z.enum([
      "Wedding",
      "Reception",
      "Birthday",
      "Corporate Meeting",
      "Pool Party",
      "Conference",
      "Other",
    ]).optional(),
    eventStartDate: z.coerce.date().optional(),
    eventEndDate: z.coerce.date().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    totalGuests: z.number().min(1).optional(),
    baseAmount: z.number().min(0).optional(),
    bookingId: objectIdSchema.optional(),
    bookedRooms: z.array(
      z.object({
        roomId: objectIdSchema.optional(),
        roomType: objectIdSchema.optional(),
        checkInDate: z.coerce.date().optional(),
        checkOutDate: z.coerce.date().optional(),
        nights: z.number().min(1).optional(),
        adults: z.number().min(1).optional(),
        children: z.number().min(0).optional(),
        ratePerNight: z.number().min(0).optional(),
        totalAmount: z.number().min(0).optional(),
        requiresCheckIn: z.boolean().optional(),
        status: z.enum(["Reserved", "Checked-In", "Checked-Out", "Cancelled"]).optional(),
      })
    ).optional(),
    totalRoomAmount: z.number().min(0).optional(),
    decorationCharge: z.number().min(0).optional(),
    cateringCharge: z.number().min(0).optional(),
    soundCharge: z.number().min(0).optional(),
    miscCharge: z.number().min(0).optional(),
    advanceAmount: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    finalAmount: z.number().min(0).optional(),
    status: z.enum(["Reserved", "Confirmed", "Completed", "Cancelled"]).optional(),
    notes: z.string().optional(),
    
    bookingDate: z.coerce.date().optional(),
    guestCount: z.number().min(1).optional(),
    contactPerson: z.string().optional(),
    contactMobile: z.string().optional(),
  }).strict(),
});

export const cancelFacilityBookingSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    reason: z.string().min(5, "Cancellation reason must be at least 5 characters"),
  }),
});

export const getFacilityBookingByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
