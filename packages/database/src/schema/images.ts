import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./columns.js";
import { products } from "./catalog.js";
import { imageCleanupOperationEnum, imageCleanupStatusEnum } from "./enums.js";

export const imageCleanup = pgTable(
  "image_cleanup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operation: imageCleanupOperationEnum("operation").notNull(),
    status: imageCleanupStatusEnum("status").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    imageId: uuid("image_id").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type"),
    byteLength: integer("byte_length"),
    altText: text("alt_text"),
    isPrimary: boolean("is_primary").notNull().default(false),
    position: integer("position"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "date" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    claimToken: uuid("claim_token"),
    idempotencyKey: text("idempotency_key"),
    payloadHash: text("payload_hash"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check(
      "image_cleanup_object_key_format",
      sql`char_length(${table.objectKey}) between 1 and 512 and ${table.objectKey} ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'`,
    ),
    check(
      "image_cleanup_operation_status",
      sql`(${table.operation} = 'upload' and ${table.status} in ('pending_upload', 'uploaded', 'stored', 'abandoned', 'failed'))
        or (${table.operation} = 'delete' and ${table.status} in ('pending_delete', 'deleted', 'failed', 'cancelled'))`,
    ),
    check("image_cleanup_attempt_nonnegative", sql`${table.attemptCount} >= 0 and ${table.maxAttempts} >= 1`),
    check(
      "image_cleanup_byte_length",
      sql`${table.byteLength} is null or (${table.byteLength} >= 1 and ${table.byteLength} <= 5242880)`,
    ),
    check(
      "image_cleanup_last_error_length",
      sql`${table.lastError} is null or char_length(${table.lastError}) between 1 and 500`,
    ),
    check(
      "image_cleanup_completed_terminal",
      sql`(${table.status} in ('stored', 'abandoned', 'deleted', 'failed', 'cancelled') and ${table.completedAt} is not null)
        or (${table.status} not in ('stored', 'abandoned', 'deleted', 'failed', 'cancelled') and ${table.completedAt} is null)`,
    ),
    check(
      "image_cleanup_content_type",
      sql`${table.contentType} is null or ${table.contentType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      "image_cleanup_alt_text_length",
      sql`${table.altText} is null or char_length(${table.altText}) between 1 and 200`,
    ),
    check("image_cleanup_position_nonnegative", sql`${table.position} is null or ${table.position} >= 0`),
    check(
      "image_cleanup_idempotency_key",
      sql`${table.idempotencyKey} is null or ${table.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'`,
    ),
    check(
      "image_cleanup_payload_hash",
      sql`${table.payloadHash} is null or ${table.payloadHash} ~ '^[a-f0-9]{64}$'`,
    ),
    uniqueIndex("image_cleanup_product_idempotency_uidx")
      .on(table.productId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("image_cleanup_one_pending_delete_idx")
      .on(table.imageId)
      .where(sql`${table.status} = 'pending_delete' and ${table.imageId} is not null`),
    uniqueIndex("image_cleanup_active_object_key_idx")
      .on(table.objectKey)
      .where(sql`${table.status} in ('pending_upload', 'uploaded')`),
    index("image_cleanup_status_retry_idx").on(table.status, table.nextRetryAt),
    index("image_cleanup_object_key_idx").on(table.objectKey),
    index("image_cleanup_image_id_idx").on(table.imageId),
  ],
);

export const imageCleanupArchive = pgTable("image_cleanup_archive", {
  id: uuid("id").primaryKey(),
  operation: imageCleanupOperationEnum("operation").notNull(),
  status: imageCleanupStatusEnum("status").notNull(),
  productId: uuid("product_id").notNull(),
  imageId: uuid("image_id").notNull(),
  objectKey: text("object_key").notNull(),
  attemptCount: integer("attempt_count").notNull(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
