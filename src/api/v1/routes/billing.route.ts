import express from "express";
import {
  getBillPreview,
  processCheckout,
  getBillingList,
  reverseBilling,
} from "../controllers/billing.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import { requirePermission } from "../middlewares/requirePermission.middleware";
import {
  processCheckoutSchema,
  getBillingListSchema,
  getBillPreviewSchema,
  reverseBillingSchema,
} from "@/api/v1/validations/billing.validation";

const router = express.Router();

// Protect all billing routes
router.use(protect);

router.post("/process-checkout", validateRequest(processCheckoutSchema), requirePermission("PROCESS_CHECKOUT"), processCheckout);

router.get("/list", validateRequest(getBillingListSchema), requirePermission(["PROCESS_CHECKOUT", "VIEW_REPORTS"]), getBillingList);

router.get("/preview/:checkInId", validateRequest(getBillPreviewSchema), requirePermission(["PROCESS_CHECKOUT", "VIEW_REPORTS"]), getBillPreview);

router.post("/:id/reverse", protect, requirePermission("REVERSE_BILLING"), reverseBilling);

// router.post("/save-draft", saveOrUpdateBill);

// router.post("/final-checkout", processFinalCheckout);

// router.get("/invoice/:invoiceNumber", getBillByInvoice);

export default router;