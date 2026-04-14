import { Router } from "express";
import { 
  createUser, 
  getUsers, 
  getUserById, 
  updateUser, 
  toggleStatus, 
  changePassword, 
  login,
  logout, 
  me 
} from "@/api/v1/controllers/user.controller";
import { validateRequest } from "@/api/v1/middlewares/validateRequest";
// import { protect } from "../middlewares/auth.middleware";
import { 
  createUserSchema, 
  updateUserSchema, 
  loginSchema, 
  changePasswordSchema, 
  toggleUserStatusSchema,
  getUSerByIdSchema
} from "@/api/v1/validations/user.validation";

const router = Router();

// Public Routes
router.post("/login", validateRequest(loginSchema), login);
router.post("/logout", logout);

// Protected Routes (Assuming `protect` middleware ensures `req.user` exists)
// router.use(protect); 

router.get("/me", me);
router.post("/change-password", validateRequest(changePasswordSchema), changePassword);

// Admin / Management Routes
router.post("/", validateRequest(createUserSchema), createUser);
router.get("/", getUsers);
router.get("/:id",validateRequest(getUSerByIdSchema), getUserById);
router.put("/:id", validateRequest(updateUserSchema), updateUser);
router.patch("/:id/toggle-status",validateRequest(toggleUserStatusSchema), toggleStatus);

export default router;