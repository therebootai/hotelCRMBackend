import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const objectIdSchema = z.string().regex(objectIdRegex, { message: "Invalid ObjectId format" });

export const createBillingSchema = z.object({
  body: z.object({
    bookingId: objectIdSchema,
    customerId: objectIdSchema,
    items: z.array(
      z.object({
        name: z.string().min(1, "Item name cannot be empty"),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        rate: z.number().min(0, "Rate cannot be negative"),
        amount: z.number().min(0, "Amount cannot be negative"),
        category: z.string().optional(),
      })
    ),
    subtotal: z.number().min(0),
    tax: z.number().min(0),
    total: z.number().min(0),
    paymentMethod: z.enum(["Cash", "Card", "UPI", "NetBanking", "Wallet", "Online"]),
    advanceAmount: z.number().min(0).optional(),
  }),
});

export const updateBillingSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        name: z.string().min(1).optional(),
        quantity: z.number().min(1).optional(),
        rate: z.number().min(0).optional(),
        amount: z.number().min(0).optional(),
        category: z.string().optional(),
      })
    ).optional(),
    paymentMethod: z.enum(["Cash", "Card", "UPI", "NetBanking", "Wallet", "Online"]).optional(),
    advanceAmount: z.number().min(0).optional(),
  }).strict(),
});

export const getBillingByIdSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

export const processPaymentSchema = z.object({
  body: z.object({
    billingId: objectIdSchema,
    amount: z.number().positive("Amount must be positive"),
    paymentMethod: z.string().min(1, "Payment method is required"),
    transactionRef: z.string().optional(),
  }),
});

// For process checkout endpoint: POST /api/v1/billing/process-checkout
export const processCheckoutSchema = z.object({
  body: z.object({
    checkInId: objectIdSchema,
    extraServices: z.array(
      z.object({
        serviceId: objectIdSchema,
        serviceName: z.string(),
        quantity: z.number().min(1),
        rate: z.number().min(0),
        total: z.number().min(0),
        date: z.coerce.date().optional(),
      })
    ).optional(),
    restaurantCharges: z.number().min(0).optional(),
    facilityCharges: z.array(
      z.object({
        facilityId: objectIdSchema,
        facilityName: z.string(),
        totalFacilityCharge: z.number().min(0),
      })
    ).optional(),
    discount: z.number().min(0).optional(),
    taxPercentage: z.number().min(0).optional(),
    notes: z.string().optional(),
    isCheckout: z.boolean().optional(),
    payment: z.object({
      amount: z.number().min(0),
      method: z.enum(["Cash", "UPI", "Card", "Bank Transfer", "Wallet", "Online"]),
      note: z.string().optional(),
    }).optional(),
  }),
});

// For GET /api/v1/billing/preview/:checkInId
export const getBillPreviewSchema = z.object({
  params: z.object({
    checkInId: objectIdSchema,
  }),
});

// For GET /api/v1/billing/list
export const getBillingListSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    search: z.string().optional(),
    status: z.string().optional(),
  }),
});

// For POST /api/v1/billing/:id/reverse — requires REVERSE_BILLING permission
export const reverseBillingSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
  body: z.object({
    ledgerEntryId: objectIdSchema.optional(),
    reason: z.string().min(5, "Reason must be at least 5 characters"),
    refundAmount: z.number().min(0).optional(),
  }),
});
