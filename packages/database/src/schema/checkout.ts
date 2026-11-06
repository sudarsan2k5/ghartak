import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./columns.js";
import { orders } from "./commerce.js";

export const guestCheckoutRequests = pgTable(
  "guest_checkout_requests",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    requestHash: text("request_hash").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "guest_checkout_requests_key_length",
      sql`char_length(${table.idempotencyKey}) between 8 and 128`,
    ),
    check("guest_checkout_requests_hash_format", sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`),
    index("guest_checkout_requests_order_id_idx").on(table.orderId),
  ],
);
