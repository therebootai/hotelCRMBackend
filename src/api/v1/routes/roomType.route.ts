import { Router } from "express";
import {
  createRoomType,
  getAllRoomTypes,
  getRoomTypeById,
  updateRoomType,
  toggleRoomTypeStatus,
  deleteRoomType,
} from "@/api/v1/controllers/roomType.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createRoomTypeSchema,
  updateRoomTypeSchema,
  getRoomTypeByIdSchema,
  deleteRoomTypeSchema,
  toggleRoomTypeStatusSchema,
} from "@/api/v1/validations/roomType.validation";

const router = Router();

router.use(protect);


router.post("/", validateRequest(createRoomTypeSchema), createRoomType);
router.get("/", getAllRoomTypes);
router.get("/:id", validateRequest(getRoomTypeByIdSchema), getRoomTypeById);
router.put("/:id", validateRequest(updateRoomTypeSchema), updateRoomType);
router.delete("/:id", validateRequest(deleteRoomTypeSchema), deleteRoomType);
router.patch("/:id/toggle-status", validateRequest(toggleRoomTypeStatusSchema), toggleRoomTypeStatus);

export default router;