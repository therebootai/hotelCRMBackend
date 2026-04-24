import { Router } from "express";
import {
  createRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
  getAvailableRooms,
} from "@/api/v1/controllers/room.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createRoomSchema,
  updateRoomSchema,
  getAllRoomsSchema,
  getOrDeleteRoomSchema,
  updateRoomStatusSchema,
} from "@/api/v1/validations/room.validation";

const router = Router();

router.use(protect);

router.post("/", validateRequest(createRoomSchema), createRoom);
router.get("/", validateRequest(getAllRoomsSchema), getAllRooms);
router.get("/available", getAvailableRooms);
router.get("/:id", validateRequest(getOrDeleteRoomSchema), getRoomById);

router.put("/:id", validateRequest(updateRoomSchema), updateRoom);
router.delete("/:id", validateRequest(getOrDeleteRoomSchema), deleteRoom);

router.patch("/:id/status", validateRequest(updateRoomStatusSchema), updateRoomStatus);

export default router;