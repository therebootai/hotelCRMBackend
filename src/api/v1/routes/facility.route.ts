import { Router } from "express";
import {
  createFacility,
  getFacilities,
  getFacilityById,
  updateFacility,
  deleteFacility,
  toggleStatus,
} from "@/api/v1/controllers/facility.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createFacilitySchema,
  updateFacilitySchema,
  getFacilityByIdSchema,
  deleteFacilitySchema,
  toggleFacilityStatusSchema,
} from "@/api/v1/validations/facility.validation";

const router = Router();

router.use(protect); 

router.post("/", validateRequest(createFacilitySchema), createFacility);
router.get("/", getFacilities);
router.get("/:id", validateRequest(getFacilityByIdSchema), getFacilityById);
router.put("/:id", validateRequest(updateFacilitySchema), updateFacility);
router.delete("/:id", validateRequest(deleteFacilitySchema), deleteFacility);
router.patch("/:id/toggle-status", validateRequest(toggleFacilityStatusSchema), toggleStatus);

export default router;