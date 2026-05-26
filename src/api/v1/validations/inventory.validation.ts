import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const getAvailabilitySchema = z.object({
  query: z.object({
    roomTypeId: objectIdSchema,
    checkIn: z.string().datetime(),
    checkOut: z.string().datetime(),
  }),
});

export const allocateRoomSchema = z.object({
  body: z.object({
    checkinId: objectIdSchema,
    roomId: objectIdSchema,
  }),
});

export const releaseRoomSchema = z.object({
  body: z.object({
    roomId: objectIdSchema,
  }),
});

export const maintenanceBlockSchema = z.object({
  body: z.object({
    roomId: objectIdSchema,
    from: z.string().datetime(),
    to: z.string().datetime(),
    reason: z.string().min(3),
  }),
});
