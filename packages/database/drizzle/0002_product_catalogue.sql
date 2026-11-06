DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "image_url" IS NOT NULL) THEN
    RAISE EXCEPTION 'product catalogue migration refused: products.image_url has values that must be moved to product_images first';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."image_storage_provider" AS ENUM('r2');--> statement-breakpoint
CREATE TYPE "public"."product_publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_attributes_product_position_unique" UNIQUE("product_id","position"),
	CONSTRAINT "product_attributes_product_name_unique" UNIQUE("product_id","name"),
	CONSTRAINT "product_attributes_name_length" CHECK (char_length("product_attributes"."name") between 1 and 80),
	CONSTRAINT "product_attributes_value_length" CHECK (char_length("product_attributes"."value") between 1 and 200),
	CONSTRAINT "product_attributes_position_nonnegative" CHECK ("product_attributes"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_provider" "image_storage_provider" DEFAULT 'r2' NOT NULL,
	"object_key" text NOT NULL,
	"delivery_path" text NOT NULL,
	"alt_text" text,
	"position" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "product_images_product_position_unique" UNIQUE("product_id","position"),
	CONSTRAINT "product_images_object_key_format" CHECK ("product_images"."object_key" ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,511}$'),
	CONSTRAINT "product_images_delivery_path_format" CHECK ("product_images"."delivery_path" ~ '^(/|https://)' and "product_images"."delivery_path" !~ '[[:space:]]' and char_length("product_images"."delivery_path") between 1 and 2048),
	CONSTRAINT "product_images_alt_text_length" CHECK ("product_images"."alt_text" is null or char_length("product_images"."alt_text") between 1 and 200),
	CONSTRAINT "product_images_position_nonnegative" CHECK ("product_images"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "publication_status" "product_publication_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_attributes_product_id_idx" ON "product_attributes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary_idx" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_publication_status_idx" ON "products" USING btree ("publication_status");--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_unique" UNIQUE("barcode");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_length" CHECK ("products"."brand" is null or char_length("products"."brand") between 1 and 120);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_format" CHECK ("products"."barcode" is null or "products"."barcode" ~ '^[0-9]{8,14}$');