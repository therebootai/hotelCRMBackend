import { z } from "zod";

// ==========================================
// CREATE USER SCHEMA
// ==========================================
export const createUserSchema = z.object({
  body: z.object({
    fullName: z
      .string({ message: "Full name is required and must be a string" })
      .min(3, "Full name must be at least 3 characters"),
    
    mobile: z
      .string({ message: "Mobile number is required" })
      .min(10, "Invalid mobile number"),
    
    role: z.enum(["admin", "receptionist"], {
      message: "Role is required and must be either 'admin' or 'receptionist'",
    }),
    
    loginId: z
      .string({ message: "Login ID is required" })
      .min(4, "Login ID must be at least 4 characters"),
    
    password: z
      .string({ message: "Password is required" })
      .min(6, "Password must be at least 6 characters"),
  }),
});

// ==========================================
// UPDATE USER SCHEMA
// ==========================================
export const updateUserSchema = z.object({
  params: z.object({
    id: z.string({ message: "User ID is required in URL" }),
  }),
  body: z
    .object({
      fullName: z.string().min(3).optional(),
      mobile: z.string().min(10).optional(),
      role: z.enum(["admin", "receptionist"]).optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
});

// ==========================================
// TOGGLE USER STATUS SCHEMA
// ==========================================
export const toggleUserStatusSchema = z.object({
  params: z.object({
    id: z.string({ message: "User ID is required in URL" }),
  }),
});

// ==========================================
// GET USER BY ID SCHEMA
// ==========================================
export const getUSerByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "User ID is required in URL" }),
  }),
});

// ==========================================
// LOGIN SCHEMA
// ==========================================
export const loginSchema = z.object({
  body: z.object({
    loginId: z.string({ message: "Login ID is required" }),
    password: z.string({ message: "Password is required" }),
  }),
});

// ==========================================
// CHANGE PASSWORD SCHEMA
// ==========================================
export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string({ message: "Old password is required" }),
    newPassword: z
      .string({ message: "New password is required" })
      .min(6, "New password must be at least 6 characters"),
  }),
});