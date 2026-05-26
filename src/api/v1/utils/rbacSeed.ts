import { Role } from "../models/role.model";
import { Permission } from "../models/permission.model";
import { RolePermission } from "../models/rolePermission.model";
import { UserRole } from "../models/userRole.model";
import { User } from "../models/user.model";

export const seedRBAC = async (): Promise<void> => {
  try {
    // 1. Seed Permissions
    const permissionsToSeed = [
      { code: "MANAGE_USERS", name: "Manage Users", description: "Create, update, or disable staff users" },
      { code: "VIEW_REPORTS", name: "View Reports", description: "Access analytics, dashboards, and financial reports" },
      { code: "MANAGE_BOOKINGS", name: "Manage Bookings", description: "Create, update, cancel bookings and check-in records" },
      { code: "PROCESS_CHECKOUT", name: "Process Checkout", description: "Complete checkouts and finalize invoice bills" },
      { code: "REVERSE_BILLING", name: "Reverse Billing", description: "Perform refunds, billing adjustments, and ledger reversals" },
      { code: "UPDATE_HOUSEKEEPING", name: "Update Housekeeping", description: "Update cleaning and room status fields" }
    ];

    const permissionMap: Record<string, any> = {};

    for (const p of permissionsToSeed) {
      let perm = await Permission.findOne({ code: p.code });
      if (!perm) {
        perm = new Permission(p);
        await perm.save();
      }
      permissionMap[p.code] = perm;
    }

    // 2. Seed Roles
    const rolesToSeed = [
      { name: "Super Admin", description: "All system permissions and administration access" },
      { name: "Manager", description: "Operational management, bookings, housekeeping, and reporting" },
      { name: "Reception", description: "Front desk booking management, check-ins, check-outs, and housekeeping" },
      { name: "Restaurant Cashier", description: "Process billing and checkouts" },
      { name: "Housekeeping", description: "Manage room cleanliness and update statuses" }
    ];

    const roleMap: Record<string, any> = {};

    for (const r of rolesToSeed) {
      let role = await Role.findOne({ name: r.name });
      if (!role) {
        role = new Role(r);
        await role.save();
      }
      roleMap[r.name] = role;
    }

    // 3. Seed Role-Permissions Mapping
    const rolePermissionMapping: Record<string, string[]> = {
      "Super Admin": ["MANAGE_USERS", "VIEW_REPORTS", "MANAGE_BOOKINGS", "PROCESS_CHECKOUT", "REVERSE_BILLING", "UPDATE_HOUSEKEEPING"],
      "Manager": ["VIEW_REPORTS", "MANAGE_BOOKINGS", "PROCESS_CHECKOUT", "UPDATE_HOUSEKEEPING"],
      "Reception": ["MANAGE_BOOKINGS", "PROCESS_CHECKOUT", "UPDATE_HOUSEKEEPING"],
      "Restaurant Cashier": ["PROCESS_CHECKOUT"],
      "Housekeeping": ["UPDATE_HOUSEKEEPING"]
    };

    for (const [roleName, permissionCodes] of Object.entries(rolePermissionMapping)) {
      const roleObj = roleMap[roleName];
      if (!roleObj) continue;

      for (const code of permissionCodes) {
        const permObj = permissionMap[code];
        if (!permObj) continue;

        const exists = await RolePermission.findOne({ roleId: roleObj._id, permissionId: permObj._id });
        if (!exists) {
          await new RolePermission({ roleId: roleObj._id, permissionId: permObj._id }).save();
        }
      }
    }

    // 4. Migrate Existing Legacy Users to Roles
    const users = await User.find({});
    for (const user of users) {
      let targetRoleName = "Reception"; // default fallback
      if (user.role === "admin") {
        targetRoleName = "Super Admin";
      } else if (user.role === "receptionist") {
        targetRoleName = "Reception";
      }

      const roleObj = roleMap[targetRoleName];
      if (roleObj) {
        const exists = await UserRole.findOne({ userId: user._id, roleId: roleObj._id });
        if (!exists) {
          await new UserRole({ userId: user._id, roleId: roleObj._id }).save();
        }
      }
    }

    console.log("RBAC Seeding and Migration Completed Successfully.");
  } catch (error) {
    console.error("Error seeding RBAC configuration:", error);
  }
};
