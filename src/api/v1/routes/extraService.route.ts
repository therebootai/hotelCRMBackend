import { Router } from "express";
import {
  createExtraService,
  getAllExtraServices,
  updateExtraService,
  toggleExtraServiceStatus,
  deleteExtraService,
} from "@/api/v1/controllers/extraService.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createExtraServiceSchema,
  updateExtraServiceSchema,
  deleteExtraServiceSchema,
  toggleExtraServiceStatusSchema,
  getAllExtraServicesSchema,
} from "@/api/v1/validations/extraService.validation";

const router = Router();

router.use(protect);

router.post("/", validateRequest(createExtraServiceSchema), createExtraService);
router.get("/", validateRequest(getAllExtraServicesSchema), getAllExtraServices);
router.put("/:id", validateRequest(updateExtraServiceSchema), updateExtraService);
router.delete("/:id", validateRequest(deleteExtraServiceSchema), deleteExtraService);
router.patch("/:id/toggle-status", validateRequest(toggleExtraServiceStatusSchema), toggleExtraServiceStatus);

export default router;