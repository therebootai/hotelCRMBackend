import { z } from "zod";
import { RoomStatusEnum } from "@/api/v1/models/roomStatus.model";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const updateRoomStatusSchema = z.object({
  body: z.object({
    roomId: objectIdSchema,
    status: z.nativeEnum(RoomStatusEnum),
    notes: z.string().optional(),
    scheduledFor: z.string().datetime().optional(),
  }),
});

export const getRoomsByStatusSchema = z.object({
  query: z.object({
    status: z.nativeEnum(RoomStatusEnum),
  }),
});
