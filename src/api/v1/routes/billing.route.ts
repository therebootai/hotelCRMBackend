import express from "express";
import { 
  getBillPreview,
  processCheckout, 
} from "../controllers/billing.controller";

const router = express.Router();


router.post("/process-checkout", processCheckout);


router.get("/preview/:checkInId", getBillPreview);

// router.post("/save-draft", saveOrUpdateBill);

// router.post("/final-checkout", processFinalCheckout);

// router.get("/invoice/:invoiceNumber", getBillByInvoice);

export default router;