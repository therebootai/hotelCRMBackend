import { z } from "zod";

// ==========================================
// CREATE ACCESS PACKAGE SCHEMA
// ==========================================
export const createAccessPackageSchema = z.object({
  body: z
    .object({
      package_id: z
        .string({ message: "Package ID is required" })
        .min(1, "Package ID cannot be empty"),

      packageName: z
        .string({ message: "Package name is required" })
        .min(2, "Package name must be at least 2 characters"),

      description: z.string().optional(),

      inclusions: z.array(z.string()).optional(),

      adult_price: z
        .number({ message: "Adult price is required" })
        .min(0, "Adult price cannot be negative"),

      child_price: z
        .number({ message: "Child price is required" })
        .min(0, "Child price cannot be negative"),

      packageType: z
        .enum(["Premium Combo", "Corporate"], {
          message: "Package type must be either 'Premium Combo' or 'Corporate'",
        })
        .optional(),

      cover_img: z
        .object({
          public_id: z.string({
            message: "Cover image public ID must be a string",
          }),
          secure_url: z.string({
            message: "Cover image secure URL must be a string",
          }),
        })
        .optional(),

      entry_time: z
        .string({ message: "Entry time is required" })
        .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
          message: "Entry time must be in HH:MM format (24-hour)",
        }),

      exit_time: z
        .string({ message: "Exit time is required" })
        .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
          message: "Exit time must be in HH:MM format (24-hour)",
        }),

      add_ons: z
        .array(z.string({ message: "Add-on ID must be a string" }))
        .optional(),

      isActive: z.boolean().optional(),
    })
    .refine(
      (data) => {
        const [entryHour, entryMinute] = data.entry_time.split(":").map(Number);
        const [exitHour, exitMinute] = data.exit_time.split(":").map(Number);
        const entryTotal = entryHour * 60 + entryMinute;
        const exitTotal = exitHour * 60 + exitMinute;
        return exitTotal > entryTotal;
      },
      {
        message: "Exit time must be after entry time",
        path: ["exit_time"],
      },
    ),
});

// ==========================================
// UPDATE ACCESS PACKAGE SCHEMA
// ==========================================
export const updateAccessPackageSchema = z.object({
  params: z.object({
    id: z.string({ message: "Package ID is required in URL" }),
  }),
  body: z
    .object({
      packageName: z.string().min(2).optional(),
      description: z.string().optional(),
      inclusions: z.array(z.string()).optional(),
      adult_price: z.number().min(0).optional(),
      child_price: z.number().min(0).optional(),
      packageType: z.enum(["Premium Combo", "Corporate"]).optional(),
      cover_img: z
        .object({
          public_id: z.string(),
          secure_url: z.string(),
        })
        .optional(),
      entry_time: z
        .string()
        .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
          message: "Entry time must be in HH:MM format (24-hour)",
        })
        .optional(),
      exit_time: z
        .string()
        .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
          message: "Exit time must be in HH:MM format (24-hour)",
        })
        .optional(),
      add_ons: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine(
      (data) => {
        if (data.entry_time !== undefined && data.exit_time !== undefined) {
          const [entryHour, entryMinute] = data.entry_time
            .split(":")
            .map(Number);
          const [exitHour, exitMinute] = data.exit_time.split(":").map(Number);
          const entryTotal = entryHour * 60 + entryMinute;
          const exitTotal = exitHour * 60 + exitMinute;
          return exitTotal > entryTotal;
        }
        return true;
      },
      {
        message: "Exit time must be after entry time",
        path: ["exit_time"],
      },
    ),
});

// ==========================================
// GET ALL ACCESS PACKAGES SCHEMA
// ==========================================
export const getAllAccessPackagesSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    activeOnly: z.enum(["true", "false"]).optional(),
    isActive: z.enum(["true", "false"]).optional(),
    packageType: z.enum(["Premium Combo", "Corporate"]).optional(),
    inclusions: z.string().optional(),
    add_ons: z.string().optional(),
    search: z.string().optional(),
  }),
});


// ==========================================
// GET ACCESS PACKAGE BY ID SCHEMA
// ==========================================
export const getAccessPackageByIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Package ID is required in URL" }),
  }),
});

// ==========================================
// DELETE ACCESS PACKAGE SCHEMA
// ==========================================
export const deleteAccessPackageSchema = z.object({
  params: z.object({
    id: z.string({ message: "Package ID is required in URL" }),
  }),
});
