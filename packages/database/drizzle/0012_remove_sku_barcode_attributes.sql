DROP TABLE "product_attributes";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "sku";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "barcode";--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN "sku";
