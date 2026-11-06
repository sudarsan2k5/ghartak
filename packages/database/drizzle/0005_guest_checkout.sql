ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "locality" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "postal_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "latitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" ALTER COLUMN "longitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_addresses" DROP CONSTRAINT "order_addresses_postal_code";--> statement-breakpoint
ALTER TABLE "order_addresses" DROP CONSTRAINT "order_addresses_latitude";--> statement-breakpoint
ALTER TABLE "order_addresses" DROP CONSTRAINT "order_addresses_longitude";--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_line1_length" CHECK (char_length("line1") between 1 and 500);--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_postal_code" CHECK ("postal_code" is null or "postal_code" ~ '^[0-9]{6}$');--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_latitude" CHECK ("latitude" is null or ("latitude" >= -90 and "latitude" <= 90));--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_longitude" CHECK ("longitude" is null or ("longitude" >= -180 and "longitude" <= 180));--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_paise" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "app_settings_key_format" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,62}$'),
	CONSTRAINT "app_settings_value_paise_nonnegative" CHECK ("value_paise" >= 0),
	CONSTRAINT "app_settings_value_paise_max" CHECK ("value_paise" <= 1000000)
);--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value_paise") VALUES ('delivery_fee', 0) ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
CREATE TABLE "guest_checkout_requests" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"order_id" uuid,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_checkout_requests_key_length" CHECK (char_length("idempotency_key") between 8 and 128),
	CONSTRAINT "guest_checkout_requests_hash_format" CHECK ("request_hash" ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
ALTER TABLE "guest_checkout_requests" ADD CONSTRAINT "guest_checkout_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_checkout_requests_order_id_idx" ON "guest_checkout_requests" USING btree ("order_id");
