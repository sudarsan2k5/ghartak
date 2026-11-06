# 0004 — Central inventory

Status: accepted

## Context

Ghartak owns and sells one catalogue. There are no independent merchants, merchant accounts, or store-specific prices. The schema from [0003](0003-database-schema.md) already kept products global, but it allowed a second fulfilment location, a second price for the same product, a store-manager role, and one active cart per location.

The local database contained only the two-store demo seed: no customers, carts, orders, or payments. That made a forward-only constraint migration safe.

## Decisions

- `products` stays the master catalogue. Price and stock stay on `store_products`, which is the single sellable inventory record for a product. `store_products.product_id` is unique, so a product cannot have a second listing.
- `stores` is the fulfilment location, not a merchant. A unique index on a constant expression allows one row. Orders keep `store_id` as the historical location reference. Carts keep `store_id` so a cart item must still match that location through the existing composite foreign key.
- A customer has one active cart. Checked-out and abandoned carts can remain.
- `inventory_movements` stays the stock ledger and still references `store_products`.
- `store_manager` is removed from the `user_role` enum. `user_roles.store_id` is removed with it. The admin role remains.
- The demo seed is one Ghartak location in the existing Demo Village zone, three categories, five products, and one opening-stock movement per product. The central prices and stock quantities are the former Demo Kirana figures: 12000, 25000, 5600, 4000, and 3000 paise, with stock 40, 25, 60, 30, and 50.
- One fulfilment location cannot serve multiple independent service zones. `stores.service_zone_id` is a required foreign key to a single zone. This migration does not add a coverage table. The smallest later change is a `store_service_zones` table linking the one location to many zones, with one row per zone, while order history continues to store `orders.store_id`.

## Consequences

Migration `0001_central_inventory` refuses to run if customers, carts, roles, or financial rows are present, or if a store or listing id is not part of the known demo seed. It then removes the second demo location and its listings and movements, and adds the constraints above. Product details and image metadata are specified in [0005](0005-product-catalogue.md). Catalogue APIs are still a later milestone.
