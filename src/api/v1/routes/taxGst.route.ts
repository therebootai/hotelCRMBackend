import { Router } from "express";
import {
  createTaxGst,
  getAllTaxGsts,
  getTaxGstById,
  updateTaxGst,
  toggleTaxGstStatus,
  deleteTaxGst,
} from "@/api/v1/controllers/taxGst.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createTaxGstSchema,
  updateTaxGstSchema,
  getTaxGstByIdSchema,
  deleteTaxGstSchema,
  toggleTaxGstStatusSchema,
  getAllTaxGstsSchema,
} from "@/api/v1/validations/taxGst.validation";

const router = Router();

router.use(protect);


router.post("/", validateRequest(createTaxGstSchema), createTaxGst);
router.get("/", validateRequest(getAllTaxGstsSchema),getAllTaxGsts);
router.get("/:id", validateRequest(getTaxGstByIdSchema), getTaxGstById);
router.put("/:id", validateRequest(updateTaxGstSchema), updateTaxGst);
router.delete("/:id", validateRequest(deleteTaxGstSchema), deleteTaxGst);
router.patch("/:id/toggle-status", validateRequest(toggleTaxGstStatusSchema), toggleTaxGstStatus);

export default router;