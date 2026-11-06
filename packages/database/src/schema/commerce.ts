import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products, storeProducts, stores } from "./catalog.js";
import { createdAt, e164, updatedAt } from "./columns.js";
import {
  addressTypeEnum,
  cartStatusEnum,
  orderPaymentStatusEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./enums.js";
import { userAddresses, users } from "./identity.js";

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: cartStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("carts_id_store_unique").on(table.id, table.storeId),
    uniqueIndex("carts_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("carts_user_id_idx").on(table.userId),
    index("carts_store_id_idx").on(table.storeId),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id").notNull(),
    storeId: uuid("store_id").notNull(),
    storeProductId: uuid("store_product_id").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.cartId, table.storeId],
      foreignColumns: [carts.id, carts.storeId],
      name: "cart_items_cart_store_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.storeProductId, table.storeId],
      foreignColumns: [storeProducts.id, storeProducts.storeId],
      name: "cart_items_store_product_store_fk",
    }).onDelete("restrict"),
    unique("cart_items_cart_product_unique").on(table.cartId, table.storeProductId),
    check("cart_items_quantity_range", sql`${table.quantity} between 1 and 999`),
    index("cart_items_cart_id_idx").on(table.cartId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("placed"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    deliveryFeePaise: integer("delivery_fee_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentStatus: orderPaymentStatusEnum("payment_status").notNull().default("pending"),
    currency: text("currency").notNull().default("INR"),
    trackingTokenHash: text("tracking_token_hash"),
    trackingTokenExpiresAt: timestamp("tracking_token_expires_at", { withTimezone: true, mode: "date" }),
    trackingTokenRevokedAt: timestamp("tracking_token_revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("orders_order_number_unique").on(table.orderNumber),
    uniqueIndex("orders_tracking_token_hash_uidx")
      .on(table.trackingTokenHash)
      .where(sql`${table.trackingTokenHash} is not null`),
    check("orders_number_format", sql`${table.orderNumber} ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'`),
    check(
      "orders_tracking_token_hash_format",
      sql`${table.trackingTokenHash} is null or ${table.trackingTokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "orders_tracking_token_hash_expiry",
      sql`(${table.trackingTokenHash} is null and ${table.trackingTokenExpiresAt} is null) or (${table.trackingTokenHash} is not null and ${table.trackingTokenExpiresAt} is not null)`,
    ),
    check(
      "orders_tracking_token_expires_after_create",
      sql`${table.trackingTokenExpiresAt} is null or ${table.trackingTokenExpiresAt} > ${table.createdAt}`,
    ),
    check(
      "orders_tracking_token_revoked_after_create",
      sql`${table.trackingTokenRevokedAt} is null or ${table.trackingTokenRevokedAt} >= ${table.createdAt}`,
    ),
    check("orders_subtotal_nonnegative", sql`${table.subtotalPaise} >= 0`),
    check("orders_discount_nonnegative", sql`${table.discountPaise} >= 0`),
    check("orders_delivery_fee_nonnegative", sql`${table.deliveryFeePaise} >= 0`),
    check("orders_tax_nonnegative", sql`${table.taxPaise} >= 0`),
    check("orders_total_nonnegative", sql`${table.totalPaise} >= 0`),
    check("orders_discount_within_subtotal", sql`${table.discountPaise} <= ${table.subtotalPaise}`),
    check(
      "orders_total_formula",
      sql`${table.totalPaise} = ${table.subtotalPaise} - ${table.discountPaise} + ${table.deliveryFeePaise} + ${table.taxPaise}`,
    ),
    check("orders_currency_inr", sql`${table.currency} = 'INR'`),
    index("orders_user_created_idx").on(table.userId, table.createdAt),
    index("orders_store_status_idx").on(table.storeId, table.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    lineTotalPaise: integer("line_total_paise").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_nonnegative", sql`${table.unitPricePaise} >= 0`),
    check("order_items_line_total_nonnegative", sql`${table.lineTotalPaise} >= 0`),
    check(
      "order_items_line_total_formula",
      sql`${table.lineTotalPaise} = ${table.quantity} * ${table.unitPricePaise}`,
    ),
    check("order_items_name_length", sql`char_length(${table.productName}) between 1 and 160`),
    index("order_items_order_id_idx").on(table.orderId),
  ],
);

export const orderAddresses = pgTable(
  "order_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sourceAddressId: uuid("source_address_id").references(() => userAddresses.id, {
      onDelete: "set null",
    }),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    addressType: addressTypeEnum("address_type").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    landmark: text("landmark"),
    locality: text("locality"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("order_addresses_order_id_unique").on(table.orderId),
    check("order_addresses_phone_e164", e164(table.phone)),
    check("order_addresses_line1_length", sql`char_length(${table.line1}) between 1 and 500`),
    check("order_addresses_postal_code", sql`${table.postalCode} is null or ${table.postalCode} ~ '^[0-9]{6}$'`),
    check("order_addresses_latitude", sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`),
    check("order_addresses_longitude", sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`),
  ],
);

export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "order_status_events_status_changed",
      sql`${table.fromStatus} is null or ${table.fromStatus} <> ${table.toStatus}`,
    ),
    index("order_status_events_order_created_idx").on(table.orderId, table.createdAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("payments_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("payments_provider_order_idx")
      .on(table.provider, table.providerOrderId)
      .where(sql`${table.providerOrderId} is not null`),
    uniqueIndex("payments_provider_payment_idx")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    check("payments_provider_format", sql`${table.provider} ~ '^[a-z0-9_]{2,32}$'`),
    check("payments_amount_positive", sql`${table.amountPaise} > 0`),
    check("payments_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "payments_idempotency_key_length",
      sql`char_length(${table.idempotencyKey}) between 8 and 128`,
    ),
    index("payments_order_id_idx").on(table.orderId),
    index("payments_status_idx").on(table.status),
  ],
);
