ALTER TABLE "orders" ADD COLUMN "tracking_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_token_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_hash_format" CHECK ("tracking_token_hash" is null or "tracking_token_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_hash_expiry" CHECK (("tracking_token_hash" is null and "tracking_token_expires_at" is null) or ("tracking_token_hash" is not null and "tracking_token_expires_at" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_expires_after_create" CHECK ("tracking_token_expires_at" is null or "tracking_token_expires_at" > "created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_revoked_after_create" CHECK ("tracking_token_revoked_at" is null or "tracking_token_revoked_at" >= "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_token_hash_uidx" ON "orders" USING btree ("tracking_token_hash") WHERE "tracking_token_hash" is not null;
