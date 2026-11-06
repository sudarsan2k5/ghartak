import { z } from "zod";

export const userRoleValues = ["customer", "admin", "delivery_partner"] as const;
export const accountStatusValues = ["active", "suspended", "closed"] as const;
export const addressTypeValues = ["home", "work", "other"] as const;
export const serviceZoneKindValues = ["village", "town", "city"] as const;
export const storeStatusValues = ["active", "inactive", "suspended"] as const;
export const productUnitValues = ["piece", "kg", "g", "litre", "ml"] as const;
export const productPublicationStatusValues = ["draft", "published", "archived"] as const;
export const imageStorageProviderValues = ["r2"] as const;
export const imageCleanupOperationValues = ["upload", "delete"] as const;
export const imageCleanupStatusValues = [
  "pending_upload",
  "uploaded",
  "stored",
  "abandoned",
  "pending_delete",
  "deleted",
  "failed",
  "cancelled",
] as const;
export const storeProductAvailabilityValues = ["available", "unavailable", "out_of_stock"] as const;
export const inventoryMovementTypeValues = ["addition", "removal", "adjustment"] as const;
export const cartStatusValues = ["active", "checked_out", "abandoned"] as const;
export const orderStatusValues = [
  "placed",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
export const paymentMethodValues = ["cash_on_delivery", "upi", "card", "net_banking"] as const;
export const orderPaymentStatusValues = ["pending", "paid", "failed", "refunded"] as const;
export const paymentStatusValues = ["pending", "authorized", "captured", "failed", "refunded"] as const;

export const userRoleSchema = z.enum(userRoleValues);
export const accountStatusSchema = z.enum(accountStatusValues);
export const addressTypeSchema = z.enum(addressTypeValues);
export const serviceZoneKindSchema = z.enum(serviceZoneKindValues);
export const storeStatusSchema = z.enum(storeStatusValues);
export const productUnitSchema = z.enum(productUnitValues);
export const productPublicationStatusSchema = z.enum(productPublicationStatusValues);
export const imageStorageProviderSchema = z.enum(imageStorageProviderValues);
export const imageCleanupOperationSchema = z.enum(imageCleanupOperationValues);
export const imageCleanupStatusSchema = z.enum(imageCleanupStatusValues);
export const storeProductAvailabilitySchema = z.enum(storeProductAvailabilityValues);
export const inventoryMovementTypeSchema = z.enum(inventoryMovementTypeValues);
export const cartStatusSchema = z.enum(cartStatusValues);
export const orderStatusSchema = z.enum(orderStatusValues);
export const paymentMethodSchema = z.enum(paymentMethodValues);
export const orderPaymentStatusSchema = z.enum(orderPaymentStatusValues);
export const paymentStatusSchema = z.enum(paymentStatusValues);

export const paiseSchema = z.number().int().nonnegative();
export const currencySchema = z.literal("INR");

export type UserRole = z.infer<typeof userRoleSchema>;
export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type AddressType = z.infer<typeof addressTypeSchema>;
export type ServiceZoneKind = z.infer<typeof serviceZoneKindSchema>;
export type StoreStatus = z.infer<typeof storeStatusSchema>;
export type ProductUnit = z.infer<typeof productUnitSchema>;
export type ProductPublicationStatus = z.infer<typeof productPublicationStatusSchema>;
export type ImageStorageProvider = z.infer<typeof imageStorageProviderSchema>;
export type ImageCleanupOperation = z.infer<typeof imageCleanupOperationSchema>;
export type ImageCleanupStatus = z.infer<typeof imageCleanupStatusSchema>;
export type StoreProductAvailability = z.infer<typeof storeProductAvailabilitySchema>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type CartStatus = z.infer<typeof cartStatusSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type OrderPaymentStatus = z.infer<typeof orderPaymentStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
