import { z } from "zod";
import { orderPaymentStatusSchema, orderStatusSchema, paiseSchema } from "./marketplace.js";

export const MAX_GUEST_CHECKOUT_ITEMS = 40;
export const MAX_DELIVERY_FEE_PAISE = 1_000_000;
export const DELIVERY_FEE_SETTING_KEY = "delivery_fee";

const indianNationalMobile = /^[6-9][0-9]{9}$/;

export function normalizeIndianMobile(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  let national = digits;
  if (digits.length === 12 && digits.startsWith("91")) {
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    national = digits.slice(1);
  } else if (digits.length !== 10) {
    return null;
  }
  if (!indianNationalMobile.test(national)) {
    return null;
  }
  return `+91${national}`;
}

export const indianMobileSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid 10-digit Indian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const guestCheckoutItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(999),
});

export const guestCheckoutRequestSchema = z
  .object({
    customerName: z.string().trim().min(1).max(120),
    customerPhone: indianMobileSchema,
    deliveryAddress: z.string().trim().min(1).max(500),
    items: z.array(guestCheckoutItemSchema).min(1).max(MAX_GUEST_CHECKOUT_ITEMS),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();

export const guestCheckoutLineSchema = z.object({
  productId: z.uuid(),
  productName: z.string().min(1).max(160),
  quantity: z.number().int().min(1),
  unitPricePaise: paiseSchema,
  lineTotalPaise: paiseSchema,
});

export const trackingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const guestCheckoutResponseSchema = z.object({
  orderNumber: z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  status: orderStatusSchema,
  paymentMethod: z.literal("cash_on_delivery"),
  paymentStatus: orderPaymentStatusSchema,
  customerName: z.string().min(1).max(120),
  items: z.array(guestCheckoutLineSchema).min(1),
  subtotalPaise: paiseSchema,
  deliveryFeePaise: paiseSchema,
  totalPaise: paiseSchema,
  createdAt: z.iso.datetime(),
  trackingToken: trackingTokenSchema,
});

export const guestCheckoutStoredResponseSchema = guestCheckoutResponseSchema.omit({
  trackingToken: true,
});

export const adminDeliveryChargeSchema = z.object({
  deliveryFeePaise: paiseSchema.max(MAX_DELIVERY_FEE_PAISE),
});

export type GuestCheckoutRequest = z.infer<typeof guestCheckoutRequestSchema>;
export type GuestCheckoutResponse = z.infer<typeof guestCheckoutResponseSchema>;
export type AdminDeliveryCharge = z.infer<typeof adminDeliveryChargeSchema>;
