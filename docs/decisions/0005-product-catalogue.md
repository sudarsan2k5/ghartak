# 0005 — Product catalogue data

Status: accepted

## Context

Ghartak admins will manage one catalogue. [0004](0004-central-inventory.md) already keeps one price and one stock quantity on `store_products`. The product row had a name, description, SKU, category, unit, pack size, and an active flag. It did not have a brand, barcode, publication state, structured specifications, or a place for more than one image. `products.image_url` was unused.

Product photos will eventually live in Cloudflare R2. This schema stores image metadata only. It does not store credentials, bucket secrets, or file bytes.

## Decisions

- `products` gains optional `brand` and `barcode`, plus `publication_status` (`draft`, `published`, `archived`). Existing rows default to `published`. `is_active` stays as the operational on/off switch. Price, stock, and availability stay on the single `store_products` row, in integer paise.
- `product_attributes` stores named specifications. A product can have many, ordered by `position`, with one value per name. Deleting a product deletes these rows.
- `product_images` stores one row per image: `storage_provider` (`r2`), the object key, a delivery path or https URL, alt text, position, and `is_primary`. A product can have many images and at most one primary. Positions are unique per product. Deleting a product deletes these rows. The database does not delete the R2 object; a later upload service does that. Object keys are 1–512 characters. PostgreSQL rejects a bounded repeat above 255, so the format check uses an unbounded repeat plus a length check. Migration `0003_object_key_check` replaces the first version of that check.
- The delivery path may be a site path such as `/catalog/toor-dal/primary.jpg` until a public R2 or CDN host exists. No access key, secret, or bucket credential is a column.
- The demo seed records brands and barcodes where useful, two images for toor dal, one primary image for each other product, and two attributes. Produce rows keep a null brand and barcode.

## Consequences

Migration `0002_product_catalogue` refuses to drop `products.image_url` if any value is present. Catalogue APIs, the admin dashboard, and the R2 bucket are still later work. The customer app continues to use its local presentation images until those APIs exist.

## Later change

Migration `0012_remove_sku_barcode_attributes` removed `products.sku`, `products.barcode`, `order_items.sku`, and the `product_attributes` table. Products are identified by id only, and the parts of this decision that describe those fields no longer apply.

Migration `0013_remove_unit_and_pack_size` removed `products.unit`, `products.package_size`, and the `product_unit` enum. The package label is the only size information a product carries. Opening stock no longer takes a reason from the admin; its movement is recorded with the reason `Opening stock`.
