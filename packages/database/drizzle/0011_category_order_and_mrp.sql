ALTER TABLE "categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "categories" SET "sort_order" = ranked.position FROM (
	SELECT "id", row_number() OVER (ORDER BY "name", "id") AS position FROM "categories"
) AS ranked WHERE "categories"."id" = ranked."id";--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" ("sort_order");--> statement-breakpoint
ALTER TABLE "store_products" ADD COLUMN "mrp_paise" integer;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_mrp_nonnegative" CHECK ("mrp_paise" IS NULL OR "mrp_paise" >= 0);
