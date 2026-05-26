import { Router } from "express";
import { getUserNotifications, markAsRead, deleteNotification } from "../controllers/notification.controller";
import { protect } from "../middlewares/auth.middleware";

const router = Router();

// Protect all notification endpoints
router.use(protect);

router.get("/", getUserNotifications);
router.patch("/read", markAsRead);
router.patch("/read/:id", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
