CREATE TYPE "public"."image_cleanup_operation" AS ENUM('upload', 'delete');--> statement-breakpoint
CREATE TYPE "public"."image_cleanup_status" AS ENUM('pending_upload', 'uploaded', 'stored', 'abandoned', 'pending_delete', 'deleted', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "image_cleanup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" "image_cleanup_operation" NOT NULL,
	"status" "image_cleanup_status" NOT NULL,
	"product_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text,
	"byte_length" integer,
	"alt_text" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"position" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_cleanup_object_key_format" CHECK (char_length("image_cleanup"."object_key") between 1 and 512 and "image_cleanup"."object_key" ~ '^[A-Za-z0-9][A-Za-z0-9/._-]*$'),
	CONSTRAINT "image_cleanup_operation_status" CHECK (("image_cleanup"."operation" = 'upload' and "image_cleanup"."status" in ('pending_upload', 'uploaded', 'stored', 'abandoned', 'failed')) or ("image_cleanup"."operation" = 'delete' and "image_cleanup"."status" in ('pending_delete', 'deleted', 'failed'))),
	CONSTRAINT "image_cleanup_attempt_nonnegative" CHECK ("image_cleanup"."attempt_count" >= 0 and "image_cleanup"."max_attempts" >= 1),
	CONSTRAINT "image_cleanup_byte_length" CHECK ("image_cleanup"."byte_length" is null or ("image_cleanup"."byte_length" >= 1 and "image_cleanup"."byte_length" <= 5242880)),
	CONSTRAINT "image_cleanup_last_error_length" CHECK ("image_cleanup"."last_error" is null or char_length("image_cleanup"."last_error") between 1 and 500),
	CONSTRAINT "image_cleanup_completed_terminal" CHECK (("image_cleanup"."status" in ('stored', 'abandoned', 'deleted', 'failed') and "image_cleanup"."completed_at" is not null) or ("image_cleanup"."status" not in ('stored', 'abandoned', 'deleted', 'failed') and "image_cleanup"."completed_at" is null)),
	CONSTRAINT "image_cleanup_content_type" CHECK ("image_cleanup"."content_type" is null or "image_cleanup"."content_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "image_cleanup_alt_text_length" CHECK ("image_cleanup"."alt_text" is null or char_length("image_cleanup"."alt_text") between 1 and 200),
	CONSTRAINT "image_cleanup_position_nonnegative" CHECK ("image_cleanup"."position" is null or "image_cleanup"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "image_cleanup" ADD CONSTRAINT "image_cleanup_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "image_cleanup_one_pending_delete_idx" ON "image_cleanup" USING btree ("image_id") WHERE "status" = 'pending_delete' and "image_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "image_cleanup_active_object_key_idx" ON "image_cleanup" USING btree ("object_key") WHERE "status" in ('pending_upload', 'uploaded');--> statement-breakpoint
CREATE INDEX "image_cleanup_status_retry_idx" ON "image_cleanup" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "image_cleanup_object_key_idx" ON "image_cleanup" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "image_cleanup_image_id_idx" ON "image_cleanup" USING btree ("image_id");
