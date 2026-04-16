import { Router } from "express";
import {
  createPricingRule,
  getAllPricingRules,
  getPricingRuleById,
  updatePricingRule,
  togglePricingRuleStatus,
  deletePricingRule,
} from "@/api/v1/controllers/pricingRule.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  getAllPricingRulesSchema,
  getOrDeletePricingRuleSchema,
  togglePricingRuleStatusSchema,
} from "@/api/v1/validations/pricingRule.validation";

const router = Router();

router.use(protect);


router.post("/", validateRequest(createPricingRuleSchema), createPricingRule);
router.get("/", validateRequest(getAllPricingRulesSchema), getAllPricingRules);
router.get("/:id", validateRequest(getOrDeletePricingRuleSchema), getPricingRuleById);
router.put("/:id", validateRequest(updatePricingRuleSchema), updatePricingRule);
router.delete("/:id", validateRequest(getOrDeletePricingRuleSchema), deletePricingRule);
router.patch("/:id/toggle-status", validateRequest(togglePricingRuleStatusSchema), togglePricingRuleStatus);

export default router;