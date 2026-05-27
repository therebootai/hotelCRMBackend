import mongoose from "mongoose";
import { Notification, INotification } from "../models/notification.model";
import { Role } from "../models/role.model";
import { UserRole } from "../models/userRole.model";

export const createNotification = async (
  userId: string | mongoose.Types.ObjectId,
  type: "system" | "booking" | "housekeeping" | "alert",
  title: string,
  message: string,
  relatedId?: string | mongoose.Types.ObjectId,
  relatedType?: string
): Promise<INotification> => {
  const notification = new Notification({
    userId: new mongoose.Types.ObjectId(userId),
    type,
    title,
    message,
    relatedId: relatedId ? new mongoose.Types.ObjectId(relatedId) : undefined,
    relatedType
  });
  await notification.save();
  return notification;
};

export const sendNotificationToRole = async (
  roleName: string,
  type: "system" | "booking" | "housekeeping" | "alert",
  title: string,
  message: string,
  relatedId?: string | mongoose.Types.ObjectId,
  relatedType?: string
): Promise<void> => {
  try {
    const roleObj = await Role.findOne({ name: roleName });
    if (!roleObj) {
      console.warn(`Role ${roleName} not found, unable to send role-based notifications.`);
      return;
    }

    const userRoles = await UserRole.find({ roleId: roleObj._id });
    if (userRoles.length === 0) return;

    const notificationPromises = userRoles.map(ur => 
      createNotification(ur.userId, type, title, message, relatedId, relatedType)
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error(`Error sending role-based notification to ${roleName}:`, error);
  }
};
