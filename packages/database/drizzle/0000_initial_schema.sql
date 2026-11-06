CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."address_type" AS ENUM('home', 'work', 'other');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('active', 'checked_out', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('addition', 'removal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash_on_delivery', 'upi', 'card', 'net_banking');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('piece', 'kg', 'g', 'litre', 'ml');--> statement-breakpoint
CREATE TYPE "public"."service_zone_kind" AS ENUM('village', 'town', 'city');--> statement-breakpoint
CREATE TYPE "public"."store_product_availability" AS ENUM('available', 'unavailable', 'out_of_stock');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin', 'store_manager', 'delivery_partner');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_product_unique" UNIQUE("cart_id","store_product_id"),
	CONSTRAINT "cart_items_quantity_range" CHECK ("cart_items"."quantity" between 1 and 999)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "cart_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_id_store_unique" UNIQUE("id","store_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "categories_name_length" CHECK (char_length("categories"."name") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_product_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_stock_after_nonnegative" CHECK ("inventory_movements"."stock_after" >= 0),
	CONSTRAINT "inventory_movements_delta_sign" CHECK (("inventory_movements"."movement_type" = 'addition' and "inventory_movements"."quantity_delta" > 0) or ("inventory_movements"."movement_type" = 'removal' and "inventory_movements"."quantity_delta" < 0) or ("inventory_movements"."movement_type" = 'adjustment' and "inventory_movements"."quantity_delta" <> 0))
);
--> statement-breakpoint
CREATE TABLE "order_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"source_address_id" uuid,
	"recipient_name" text NOT NULL,
	"phone" text NOT NULL,
	"address_type" "address_type" NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"locality" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_addresses_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "order_addresses_phone_e164" CHECK ("order_addresses"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "order_addresses_postal_code" CHECK ("order_addresses"."postal_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "order_addresses_latitude" CHECK ("order_addresses"."latitude" >= -90 and "order_addresses"."latitude" <= 90),
	CONSTRAINT "order_addresses_longitude" CHECK ("order_addresses"."longitude" >= -180 and "order_addresses"."longitude" <= 180)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"line_total_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_nonnegative" CHECK ("order_items"."unit_price_paise" >= 0),
	CONSTRAINT "order_items_line_total_nonnegative" CHECK ("order_items"."line_total_paise" >= 0),
	CONSTRAINT "order_items_line_total_formula" CHECK ("order_items"."line_total_paise" = "order_items"."quantity" * "order_items"."unit_price_paise"),
	CONSTRAINT "order_items_name_length" CHECK (char_length("order_items"."product_name") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_events_status_changed" CHECK ("order_status_events"."from_status" is null or "order_status_events"."from_status" <> "order_status_events"."to_status")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'placed' NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"delivery_fee_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'pending' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_number_format" CHECK ("orders"."order_number" ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
	CONSTRAINT "orders_subtotal_nonnegative" CHECK ("orders"."subtotal_paise" >= 0),
	CONSTRAINT "orders_discount_nonnegative" CHECK ("orders"."discount_paise" >= 0),
	CONSTRAINT "orders_delivery_fee_nonnegative" CHECK ("orders"."delivery_fee_paise" >= 0),
	CONSTRAINT "orders_tax_nonnegative" CHECK ("orders"."tax_paise" >= 0),
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total_paise" >= 0),
	CONSTRAINT "orders_discount_within_subtotal" CHECK ("orders"."discount_paise" <= "orders"."subtotal_paise"),
	CONSTRAINT "orders_total_formula" CHECK ("orders"."total_paise" = "orders"."subtotal_paise" - "orders"."discount_paise" + "orders"."delivery_fee_paise" + "orders"."tax_paise"),
	CONSTRAINT "orders_currency_inr" CHECK ("orders"."currency" = 'INR')
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_provider_format" CHECK ("payments"."provider" ~ '^[a-z0-9_]{2,32}$'),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_paise" > 0),
	CONSTRAINT "payments_currency_inr" CHECK ("payments"."currency" = 'INR'),
	CONSTRAINT "payments_idempotency_key_length" CHECK (char_length("payments"."idempotency_key") between 8 and 128)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sku" text NOT NULL,
	"image_url" text,
	"unit" "product_unit" NOT NULL,
	"package_size" numeric(10, 3) NOT NULL,
	"package_label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_sku_format" CHECK ("products"."sku" ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
	CONSTRAINT "products_name_length" CHECK (char_length("products"."name") between 1 and 160),
	CONSTRAINT "products_package_size_positive" CHECK ("products"."package_size" > 0),
	CONSTRAINT "products_package_label_length" CHECK (char_length("products"."package_label") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "service_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "service_zone_kind" NOT NULL,
	"state" text NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_zones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "service_zones_slug_format" CHECK ("service_zones"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "service_zones_name_length" CHECK (char_length("service_zones"."name") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_paise" integer NOT NULL,
	"stock_quantity" integer NOT NULL,
	"availability" "store_product_availability" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_id_store_unique" UNIQUE("id","store_id"),
	CONSTRAINT "store_products_store_product_unique" UNIQUE("store_id","product_id"),
	CONSTRAINT "store_products_price_nonnegative" CHECK ("store_products"."price_paise" >= 0),
	CONSTRAINT "store_products_stock_nonnegative" CHECK ("store_products"."stock_quantity" >= 0),
	CONSTRAINT "store_products_available_requires_stock" CHECK ("store_products"."availability" <> 'available' or "store_products"."stock_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"line1" text NOT NULL,
	"landmark" text,
	"locality" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_zone_name_unique" UNIQUE("service_zone_id","name"),
	CONSTRAINT "stores_name_length" CHECK (char_length("stores"."name") between 1 and 160),
	CONSTRAINT "stores_phone_e164" CHECK ("stores"."contact_phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "stores_email_normalized" CHECK ("stores"."contact_email" is null or ("stores"."contact_email" = lower("stores"."contact_email") and "stores"."contact_email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
	CONSTRAINT "stores_postal_code" CHECK ("stores"."postal_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "stores_latitude" CHECK ("stores"."latitude" >= -90 and "stores"."latitude" <= 90),
	CONSTRAINT "stores_longitude" CHECK ("stores"."longitude" >= -180 and "stores"."longitude" <= 180)
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address_type" "address_type" NOT NULL,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"locality" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_addresses_phone_e164" CHECK ("user_addresses"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "user_addresses_postal_code" CHECK ("user_addresses"."postal_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "user_addresses_latitude" CHECK ("user_addresses"."latitude" >= -90 and "user_addresses"."latitude" <= 90),
	CONSTRAINT "user_addresses_longitude" CHECK ("user_addresses"."longitude" >= -180 and "user_addresses"."longitude" <= 180),
	CONSTRAINT "user_addresses_line1_length" CHECK (char_length("user_addresses"."line1") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"store_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_role_store_unique" UNIQUE NULLS NOT DISTINCT("user_id","role","store_id"),
	CONSTRAINT "user_roles_store_manager_store" CHECK (("user_roles"."role" = 'store_manager' and "user_roles"."store_id" is not null) or ("user_roles"."role" <> 'store_manager' and "user_roles"."store_id" is null))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") between 1 and 160),
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" is null or ("users"."email" = lower("users"."email") and "users"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_store_fk" FOREIGN KEY ("cart_id","store_id") REFERENCES "public"."carts"("id","store_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_store_product_store_fk" FOREIGN KEY ("store_product_id","store_id") REFERENCES "public"."store_products"("id","store_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_source_address_id_user_addresses_id_fk" FOREIGN KEY ("source_address_id") REFERENCES "public"."user_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_service_zone_id_service_zones_id_fk" FOREIGN KEY ("service_zone_id") REFERENCES "public"."service_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_one_active_per_user_store_idx" ON "carts" USING btree ("user_id","store_id") WHERE "carts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "carts_user_id_idx" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "carts_store_id_idx" ON "carts" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_store_product_created_idx" ON "inventory_movements" USING btree ("store_product_id","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_events_order_created_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_status_idx" ON "orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_order_idx" ON "payments" USING btree ("provider","provider_order_id") WHERE "payments"."provider_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_idx" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_zones_kind_idx" ON "service_zones" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "store_products_store_id_idx" ON "store_products" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_products_product_id_idx" ON "store_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stores_service_zone_id_idx" ON "stores" USING btree ("service_zone_id");--> statement-breakpoint
CREATE INDEX "stores_status_idx" ON "stores" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_one_default_idx" ON "user_addresses" USING btree ("user_id") WHERE "user_addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_store_id_idx" ON "user_roles" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");