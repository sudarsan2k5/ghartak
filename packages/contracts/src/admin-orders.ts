import { z } from "zod";
import {
  addressTypeSchema,
  orderPaymentStatusSchema,
  orderStatusSchema,
  paiseSchema,
  paymentMethodSchema,
  paymentStatusSchema,
} from "./marketplace.js";

export const adminCustomerTypeSchema = z.enum(["guest", "registered"]);
export const adminOrderAdvanceStatusSchema = z.enum([
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
]);

export const adminOrderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: orderStatusSchema.optional(),
  paymentStatus: orderPaymentStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  customerType: adminCustomerTypeSchema.optional(),
  orderNumber: z.string().trim().min(1).max(64).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().min(1).max(20).optional(),
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
});

export const adminOrderListItemSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerType: adminCustomerTypeSchema,
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  paymentStatus: orderPaymentStatusSchema,
  itemCount: z.number().int().nonnegative(),
  subtotalPaise: paiseSchema,
  deliveryFeePaise: paiseSchema,
  totalPaise: paiseSchema,
  createdAt: z.iso.datetime(),
});

export const adminOrderListResponseSchema = z.object({
  orders: z.array(adminOrderListItemSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
  }),
});

export const adminOrderStatusUpdateSchema = z
  .object({
    status: adminOrderAdvanceStatusSchema,
  })
  .strict();

export const adminOrderCancelSchema = z
  .object({
    reason: z.string().trim().min(1).max(200),
  })
  .strict();

export const adminOrderItemSchema = z.object({
  productId: z.uuid(),
  productName: z.string(),
  quantity: z.number().int().min(1),
  unitPricePaise: paiseSchema,
  lineTotalPaise: paiseSchema,
});

export const adminOrderAddressSchema = z.object({
  recipientName: z.string(),
  phone: z.string(),
  addressType: addressTypeSchema,
  line1: z.string(),
  line2: z.string().nullable(),
  landmark: z.string().nullable(),
  locality: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const adminOrderPaymentSchema = z.object({
  provider: z.string(),
  amountPaise: paiseSchema,
  status: paymentStatusSchema,
});

export const adminOrderStatusEventSchema = z.object({
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  note: z.string().nullable(),
  actor: z
    .object({
      id: z.uuid(),
      name: z.string(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});

export const adminOrderDetailSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  status: orderStatusSchema,
  customerType: adminCustomerTypeSchema,
  customerName: z.string(),
  customerPhone: z.string(),
  userId: z.uuid().nullable(),
  address: adminOrderAddressSchema,
  items: z.array(adminOrderItemSchema).min(1),
  subtotalPaise: paiseSchema,
  deliveryFeePaise: paiseSchema,
  discountPaise: paiseSchema,
  taxPaise: paiseSchema,
  totalPaise: paiseSchema,
  paymentMethod: paymentMethodSchema,
  paymentStatus: orderPaymentStatusSchema,
  payment: adminOrderPaymentSchema.nullable(),
  statusHistory: z.array(adminOrderStatusEventSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminOrderSummaryQuerySchema = z.object({
  createdFrom: z.iso.datetime().optional(),
  createdTo: z.iso.datetime().optional(),
});

export const adminOrderSummarySchema = z.object({
  totalOrders: z.number().int().nonnegative(),
  placed: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  packed: z.number().int().nonnegative(),
  outForDelivery: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  guestOrders: z.number().int().nonnegative(),
  registeredOrders: z.number().int().nonnegative(),
  codAwaitingPaymentCount: z.number().int().nonnegative(),
  codAwaitingCollectionPaise: paiseSchema,
});

export type AdminCustomerType = z.infer<typeof adminCustomerTypeSchema>;
export type AdminOrderAdvanceStatus = z.infer<typeof adminOrderAdvanceStatusSchema>;
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type AdminOrderListResponse = z.infer<typeof adminOrderListResponseSchema>;
export type AdminOrderListItem = z.infer<typeof adminOrderListItemSchema>;
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;
export type AdminOrderStatusUpdate = z.infer<typeof adminOrderStatusUpdateSchema>;
export type AdminOrderCancel = z.infer<typeof adminOrderCancelSchema>;
export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;
export type AdminOrderSummaryQuery = z.infer<typeof adminOrderSummaryQuerySchema>;
