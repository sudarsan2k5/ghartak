ALTER TABLE "image_cleanup" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD COLUMN "payload_hash" text;--> statement-breakpoint
ALTER TABLE "image_cleanup" DROP CONSTRAINT "image_cleanup_operation_status";--> statement-breakpoint
ALTER TABLE "image_cleanup" DROP CONSTRAINT "image_cleanup_completed_terminal";--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD CONSTRAINT "image_cleanup_operation_status" CHECK (("image_cleanup"."operation" = 'upload' and "image_cleanup"."status" in ('pending_upload', 'uploaded', 'stored', 'abandoned', 'failed')) or ("image_cleanup"."operation" = 'delete' and "image_cleanup"."status" in ('pending_delete', 'deleted', 'failed', 'cancelled')));--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD CONSTRAINT "image_cleanup_completed_terminal" CHECK (("image_cleanup"."status" in ('stored', 'abandoned', 'deleted', 'failed', 'cancelled') and "image_cleanup"."completed_at" is not null) or ("image_cleanup"."status" not in ('stored', 'abandoned', 'deleted', 'failed', 'cancelled') and "image_cleanup"."completed_at" is null));--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD CONSTRAINT "image_cleanup_idempotency_key" CHECK ("image_cleanup"."idempotency_key" is null or "image_cleanup"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$');--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD CONSTRAINT "image_cleanup_payload_hash" CHECK ("image_cleanup"."payload_hash" is null or "image_cleanup"."payload_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE UNIQUE INDEX "image_cleanup_product_idempotency_uidx" ON "image_cleanup" USING btree ("product_id","idempotency_key") WHERE "image_cleanup"."idempotency_key" is not null;--> statement-breakpoint
CREATE TABLE "image_cleanup_archive" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation" "image_cleanup_operation" NOT NULL,
	"status" "image_cleanup_status" NOT NULL,
	"product_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
