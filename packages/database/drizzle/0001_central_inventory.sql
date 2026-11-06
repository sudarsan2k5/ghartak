DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders")
    OR EXISTS (SELECT 1 FROM "order_items")
    OR EXISTS (SELECT 1 FROM "payments")
    OR EXISTS (SELECT 1 FROM "users")
    OR EXISTS (SELECT 1 FROM "carts")
    OR EXISTS (SELECT 1 FROM "user_roles") THEN
    RAISE EXCEPTION 'central inventory migration refused: customer, cart, role, or financial rows are present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "stores"
    WHERE "id" NOT IN (
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012'
    )
  ) THEN
    RAISE EXCEPTION 'central inventory migration refused: unexpected fulfilment location';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "store_products"
    WHERE "store_id" NOT IN (
      '10000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000012'
    )
  ) THEN
    RAISE EXCEPTION 'central inventory migration refused: unexpected inventory listing';
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "inventory_movements"
WHERE "store_product_id" IN (
  SELECT "id" FROM "store_products"
  WHERE "store_id" = '10000000-0000-4000-8000-000000000012'
);--> statement-breakpoint
DELETE FROM "store_products"
WHERE "store_id" = '10000000-0000-4000-8000-000000000012';--> statement-breakpoint
DELETE FROM "stores"
WHERE "id" = '10000000-0000-4000-8000-000000000012';--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM "stores") > 1 THEN
    RAISE EXCEPTION 'central inventory migration refused: more than one fulfilment location remains';
  END IF;
  IF EXISTS (
    SELECT "product_id" FROM "store_products" GROUP BY "product_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'central inventory migration refused: a product still has more than one listing';
  END IF;
END $$;--> statement-breakpoint
UPDATE "stores"
SET
  "name" = 'Ghartak',
  "contact_email" = 'warehouse@ghartak.example',
  "line1" = '1 Warehouse Lane',
  "landmark" = 'Village market edge'
WHERE "id" = '10000000-0000-4000-8000-000000000011';--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_role_store_unique";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_store_manager_store";--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_store_id_fk";--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin', 'delivery_partner');--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
DROP INDEX "carts_one_active_per_user_store_idx";--> statement-breakpoint
DROP INDEX "user_roles_store_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "carts_one_active_per_user_idx" ON "carts" USING btree ("user_id") WHERE "carts"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "stores_one_fulfilment_location_idx" ON "stores" USING btree ((true));--> statement-breakpoint
ALTER TABLE "user_roles" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_unique" UNIQUE("product_id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_role_unique" UNIQUE("user_id","role");
