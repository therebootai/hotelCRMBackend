import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

const idProofTypeEnum = z.enum(["AADHAR", "PAN", "PASSPORT", "DL"]);

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string({ message: "Customer name is required" }).min(2).max(100),
    fullName: z.string().min(2).max(100).optional(), // compatibility with custom payload names
    email: z.string().email("Invalid email format").optional().or(z.literal("")),
    phone: z.string({ message: "Phone number is required" }).regex(/^\d{10}$/, "Phone number must be a 10-digit number"),
    alternatePhone: z.string().optional().or(z.literal("")),
    altPhone: z.string().optional().or(z.literal("")), // alias
    
    address: z.string().optional().or(
      z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        pincode: z.string().optional(),
      }).transform(val => {
        const parts = [val.street, val.city, val.state, val.pincode].filter(Boolean);
        return parts.join(", ");
      })
    ),
    
    identityProof: z.object({
      idType: z.string(),
      idNumber: z.string(),
      document: z.object({
        public_id: z.string(),
        secure_url: z.string().url(),
      }).optional(),
    }).optional(),
    
    idProof: z.object({
      type: idProofTypeEnum,
      number: z.string(),
      documentUrl: z.string().url().optional(),
    }).optional(),

    preferences: z.object({
      smokingRoom: z.boolean().default(false),
      highFloor: z.boolean().default(false),
      nearLift: z.boolean().default(false),
      bedType: z.string().optional(),
      preferredRoomType: objectIdSchema.optional(),
      notes: z.string().optional(),
    }).optional(),

    customerCategory: z.enum(["Individual", "Corporate", "Travel Agent", "OTA"]).default("Individual"),
    companyName: z.string().optional(),
    companyGST: z.string().optional(),
    
    loyaltyTier: z.enum(["Bronze", "Silver", "Gold", "Platinum"]).optional(),
    membershipTier: z.enum(["Standard", "Silver", "Gold", "Platinum"]).optional(), // alias
    
    internalNotes: z.string().optional(),
    blacklisted: z.boolean().default(false),
    blacklistReason: z.string().optional(),
  }),
});

export const updateCustomerSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    fullName: z.string().min(2).max(100).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().regex(/^\d{10}$/).optional(),
    alternatePhone: z.string().optional().or(z.literal("")),
    altPhone: z.string().optional().or(z.literal("")),
    
    address: z.string().optional(),
    
    identityProof: z.object({
      idType: z.string().optional(),
      idNumber: z.string().optional(),
      document: z.object({
        public_id: z.string(),
        secure_url: z.string().url(),
      }).optional(),
    }).optional(),
    
    idProof: z.object({
      type: idProofTypeEnum.optional(),
      number: z.string().optional(),
      documentUrl: z.string().url().optional(),
    }).optional(),

    preferences: z.object({
      smokingRoom: z.boolean().optional(),
      highFloor: z.boolean().optional(),
      nearLift: z.boolean().optional(),
      bedType: z.string().optional(),
      preferredRoomType: objectIdSchema.optional(),
      notes: z.string().optional(),
    }).optional(),

    customerCategory: z.enum(["Individual", "Corporate", "Travel Agent", "OTA"]).optional(),
    companyName: z.string().optional(),
    companyGST: z.string().optional(),
    
    loyaltyTier: z.enum(["Bronze", "Silver", "Gold", "Platinum"]).optional(),
    membershipTier: z.enum(["Standard", "Silver", "Gold", "Platinum"]).optional(),
    
    internalNotes: z.string().optional(),
    blacklisted: z.boolean().optional(),
    blacklistReason: z.string().optional(),
  }).strict(),
});

export const searchCustomerSchema = z.object({
  query: z.object({
    query: z.string().optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

export const getCustomerByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
