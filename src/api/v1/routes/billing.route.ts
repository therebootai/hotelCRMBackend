import express from "express";
import { 
  getBillPreview,
  processCheckout, 
  getBillingList,
} from "../controllers/billing.controller";

const router = express.Router();


router.post("/process-checkout", processCheckout);

router.get("/list", getBillingList);

router.get("/preview/:checkInId", getBillPreview);

// router.post("/save-draft", saveOrUpdateBill);

// router.post("/final-checkout", processFinalCheckout);

// router.get("/invoice/:invoiceNumber", getBillByInvoice);

export default router;