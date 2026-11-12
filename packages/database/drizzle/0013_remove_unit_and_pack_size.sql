ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_package_size_positive";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "unit";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "package_size";--> statement-breakpoint
DROP TYPE "public"."product_unit";
