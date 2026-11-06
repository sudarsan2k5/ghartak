import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["customer", "admin", "delivery_partner"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended", "closed"]);
export const addressTypeEnum = pgEnum("address_type", ["home", "work", "other"]);
export const serviceZoneKindEnum = pgEnum("service_zone_kind", ["village", "town", "city"]);
export const storeStatusEnum = pgEnum("store_status", ["active", "inactive", "suspended"]);
export const productUnitEnum = pgEnum("product_unit", ["piece", "kg", "g", "litre", "ml"]);
export const productPublicationStatusEnum = pgEnum("product_publication_status", [
  "draft",
  "published",
  "archived",
]);
export const imageStorageProviderEnum = pgEnum("image_storage_provider", ["r2"]);
export const imageCleanupOperationEnum = pgEnum("image_cleanup_operation", ["upload", "delete"]);
export const imageCleanupStatusEnum = pgEnum("image_cleanup_status", [
  "pending_upload",
  "uploaded",
  "stored",
  "abandoned",
  "pending_delete",
  "deleted",
  "failed",
  "cancelled",
]);
export const storeProductAvailabilityEnum = pgEnum("store_product_availability", [
  "available",
  "unavailable",
  "out_of_stock",
]);
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "addition",
  "removal",
  "adjustment",
]);
export const cartStatusEnum = pgEnum("cart_status", ["active", "checked_out", "abandoned"]);
export const orderStatusEnum = pgEnum("order_status", [
  "placed",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash_on_delivery",
  "upi",
  "card",
  "net_banking",
]);
export const orderPaymentStatusEnum = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);
