import { type Response, type NextFunction } from "express";
import { type AuthRequest } from "../interfaces/auth";
import { httpError } from "../utils/httpError";
import { UserRole } from "../models/userRole.model";
import { RolePermission } from "../models/rolePermission.model";
import { Permission } from "../models/permission.model";
import { Role } from "../models/role.model";

export const requirePermission = (requiredPermissions: string | string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return httpError(next, new Error("Authentication required"), req, 401);
      }

      const permissionsToCheck = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      // Get user roles
      const userRoles = await UserRole.find({ userId: req.user._id });
      if (!userRoles || userRoles.length === 0) {
        return httpError(next, new Error("Access denied: No roles assigned"), req, 403);
      }

      const roleIds = userRoles.map(ur => ur.roleId);

      // Filter to only active roles
      const activeRoles = await Role.find({ _id: { $in: roleIds }, isActive: true });
      if (activeRoles.length === 0) {
        return httpError(next, new Error("Access denied: Associated roles are disabled"), req, 403);
      }
      const activeRoleIds = activeRoles.map(r => r._id);

      // Find permission IDs for the specified code(s)
      const permissionDocs = await Permission.find({ code: { $in: permissionsToCheck } });
      if (permissionDocs.length === 0) {
        return httpError(next, new Error(`Access denied: Permission definitions not found`), req, 403);
      }
      const permissionIds = permissionDocs.map(p => p._id);

      // Check if role-permission link exists
      const allowedMapping = await RolePermission.findOne({
        roleId: { $in: activeRoleIds },
        permissionId: { $in: permissionIds }
      });

      if (!allowedMapping) {
        return httpError(next, new Error("Access denied: Insufficient permissions"), req, 403);
      }

      return next();
    } catch (error) {
      return httpError(next, error, req, 500);
    }
  };
};
