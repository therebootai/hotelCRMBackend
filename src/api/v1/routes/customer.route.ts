import { Router } from "express";
import {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from "@/api/v1/controllers/customer.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest.middleware";
import { protect } from "@/api/v1/middlewares/auth.middleware";
import {
  createCustomerSchema,
  updateCustomerSchema,
  searchCustomerSchema,
  getCustomerByIdSchema,
} from "@/api/v1/validations/customer.validation";

const router = Router();

router.use(protect);

router.post("/", validateRequest(createCustomerSchema), createCustomer);
router.get("/", validateRequest(searchCustomerSchema), getAllCustomers);
router.get("/:id", validateRequest(getCustomerByIdSchema), getCustomerById);
router.put("/:id", validateRequest(updateCustomerSchema), updateCustomer);
router.delete("/:id", validateRequest(getCustomerByIdSchema), deleteCustomer);

export default router;
