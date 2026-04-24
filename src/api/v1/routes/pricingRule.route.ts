import { Router } from "express";
import {
  bulkUpsertPricingRules,
  getPricingRulesByDateRange,
  getRoomRates,
  getPriceForRoomAndDate,
  getRateManagementGrid,
} from "@/api/v1/controllers/pricingRule.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  bulkUpsertPricingRulesSchema,
  getPricingRulesByDateRangeSchema,
  getRoomRatesSchema,
  getPriceForRoomAndDateSchema,
  getRateManagementGridSchema,
} from "@/api/v1/validations/pricingRule.validation";

const router = Router();

router.use(protect);

// POST /rates/bulk - Add or update multiple room prices at once
router.post(
  "/bulk", 
  validateRequest(bulkUpsertPricingRulesSchema), 
  bulkUpsertPricingRules
);

router.get("/grid", validateRequest(getRateManagementGridSchema), getRateManagementGrid);

// GET /rates - Fetch prices for multiple rooms over a specific date range
router.get(
  "/", 
  validateRequest(getPricingRulesByDateRangeSchema), 
  getPricingRulesByDateRange
);


// GET /rates/room/:roomId - Get a date range of prices for a specific room
router.get(
  "/room/:roomId", 
  validateRequest(getRoomRatesSchema), 
  getRoomRates
);

// GET /rates/room/:roomId/exact - Get the price for a specific room on a specific date
router.get(
  "/room/:roomId/exact", 
  validateRequest(getPriceForRoomAndDateSchema), 
  getPriceForRoomAndDate
);



export default router;