import { type Response, type NextFunction } from "express";
import { type AuthRequest } from "../interfaces/auth";
import { httpError } from "../utils/httpError";
import mongoose from "mongoose";

/**
 * Middleware that checks if req.user is the owner of a resource, or has Super Admin role to bypass.
 * @param model Mongoose Model to query
 * @param idParam Name of the request parameter containing the resource ID
 * @param userIdField Field name in the document indicating ownership (default 'userId' or 'createdBy')
 */
export const checkOwnershipOrAdmin = (
  model: mongoose.Model<any>,
  idParam: string = "id",
  userIdField: string = "createdBy"
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return httpError(next, new Error("Authentication required"), req, 401);
      }

      // If user is Super Admin bypass ownership check
      const { UserRole } = await import("../models/userRole.model");
      const { Role } = await import("../models/role.model");

      const userRoles = await UserRole.find({ userId: req.user._id });
      const roleIds = userRoles.map(ur => ur.roleId);
      const superAdminRole = await Role.findOne({ _id: { $in: roleIds }, name: "Super Admin" });

      if (superAdminRole) {
        return next();
      }

      const resourceId = req.params[idParam];
      if (!resourceId) {
        return httpError(next, new Error("Resource ID parameter not found"), req, 400);
      }

      const document = await model.findById(resourceId);
      if (!document) {
        return httpError(next, new Error("Resource not found"), req, 404);
      }

      const ownerId = document[userIdField];
      if (!ownerId) {
        return httpError(next, new Error("Resource ownership field not defined on the document"), req, 400);
      }

      if (ownerId.toString() !== req.user._id.toString()) {
        return httpError(next, new Error("Access denied: You do not own this resource"), req, 403);
      }

      return next();
    } catch (error) {
      return httpError(next, error, req, 500);
    }
  };
};
