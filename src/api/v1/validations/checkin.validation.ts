import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const createCheckinSchema = z.object({
  body: z.object({
    payload: z.string().optional(), // In case it is sent as stringified JSON in multipart
    bookingId: objectIdSchema.optional(),
    checkInType: z.enum(["Individual", "Corporate"]).optional(),
    roomSelections: z.array(z.any()).optional(),
    primaryGuest: z.any().optional(),
    guests: z.array(z.any()).optional(),
    checkInTime: z.string().optional(),
    expectedCheckOutTime: z.string().optional(),
  }).passthrough(),
});

export const updateCheckinSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    roomId: objectIdSchema.optional(),
    guestDetails: z.array(z.any()).optional(),
    checkInTime: z.string().optional(),
  }).strict(),
});

export const extendStaySchema = z.object({
  query: z.object({
    checkInId: objectIdSchema,
    newExpectedCheckout: z.string().min(1, "New expected checkout is required"),
    newRoomId: objectIdSchema.optional(),
    appliedPrice: z.string().optional(),
    roomNumber: z.string().optional(),
    newAdvanceAmount: z.string().optional(),
    paymentMode: z.string().optional(),
    transactionId: z.string().optional(),
    advanceNote: z.string().optional(),
  }),
});

export const checkOutSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    billingFinalized: z.boolean(),
    paymentMode: z.enum(["Cash", "UPI", "Card", "Bank Transfer", "Wallet", "Online"]),
    transactionRef: z.string().optional(),
  }),
});

export const getCheckInByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const getCheckInListSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
  }).passthrough(),
});

export const roomChangeSchema = z.object({
  checkInId: z.string().min(1, "Check-in ID is required"),
  newRoomId: z.string().min(1, "New room ID is required"),
  newRoomType: z.string().optional(),
  effectiveDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid effective date",
  }),
});
