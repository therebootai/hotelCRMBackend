import { Response } from "express";
import { type AuthRequest } from "../interfaces/auth";
import { Notification } from "../models/notification.model";
import httpResponse from "../utils/httpResponse";
import { httpError } from "../utils/httpError";

export const getUserNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { page = 1, limit = 15, isRead } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = { userId: req.user._id };
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const totalCount = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });

    return httpResponse(req, res, 200, "Notifications retrieved successfully", {
      notifications,
      unreadCount,
      pagination: {
        totalCount,
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { id } = req.params;

    if (id) {
      const notification = await Notification.findOneAndUpdate(
        { _id: id, userId: req.user._id },
        { isRead: true },
        { new: true }
      );
      if (!notification) {
        return res.status(404).json({ success: false, message: "Notification not found" });
      }
      return httpResponse(req, res, 200, "Notification marked as read", notification);
    } else {
      // Bulk mark all as read
      await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
      return httpResponse(req, res, 200, "All notifications marked as read");
    }
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }

    const { id } = req.params;
    const notification = await Notification.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return httpResponse(req, res, 200, "Notification deleted successfully");
  } catch (error) {
    return httpError(res as any, error, req, 500);
  }
};
