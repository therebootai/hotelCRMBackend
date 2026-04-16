import { Router } from "express";
import {
  createAmenity,
  getAllAmenities,
  updateAmenity,
  toggleAmenityStatus,
  deleteAmenity,
} from "@/api/v1/controllers/amenity.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createAmenitySchema,
  updateAmenitySchema,
  deleteAmenitySchema,
  toggleAmenityStatusSchema,
  getAllAmenitiesSchema,
} from "@/api/v1/validations/amenity.validation";

const router = Router();

router.use(protect);


router.post("/", validateRequest(createAmenitySchema), createAmenity);
router.get("/", validateRequest(getAllAmenitiesSchema), getAllAmenities);
router.put("/:id", validateRequest(updateAmenitySchema), updateAmenity);
router.delete("/:id", validateRequest(deleteAmenitySchema), deleteAmenity);
router.patch("/:id/toggle-status", validateRequest(toggleAmenityStatusSchema), toggleAmenityStatus);

export default router;