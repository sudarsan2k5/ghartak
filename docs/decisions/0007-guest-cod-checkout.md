# 0007 — Guest COD checkout

Status: accepted

## Context

Ghartak wants village customers to order groceries with a name, a mobile number, and one free-text address. Customer accounts, OTP, UPI, and delivery-zone engines are postponed. The schema from [0003](0003-database-schema.md) required a user on every order and a structured address with PIN and coordinates. Inventory already had a nullable movement actor ([0004](0004-central-inventory.md)).

## Decisions

- Do not create shadow customer users. `orders.user_id` is nullable. Guest identity is snapshotted on `order_addresses` (`recipient_name`, E.164 `phone`, `line1`).
- Structured address columns (`locality`, `city`, `state`, `postal_code`, `latitude`, `longitude`) stay on the table for later use but are nullable. Guest checkout fills only `line1` and `address_type = other`.
- There is one global delivery fee in `app_settings` (`delivery_fee`, integer paise, default 0, max 1_000_000). The fee is copied onto each order. History does not change when an administrator updates the setting.
- Guest submissions use `guest_checkout_requests` (idempotency key primary key, SHA-256 request hash, order id, JSON response) inside the same transaction as order creation.
- Payment method is `cash_on_delivery`. Provider `cod`. Status `pending` at creation. No gateway.
- Order status starts at existing `placed`. Future steps stay `confirmed` → `packed` → `out_for_delivery` → `delivered`, or `cancelled`.
- Stock deduction uses the existing `store_products` row and `inventory_movements` ledger. Guest movements set `actor_user_id` to null. They do not impersonate an administrator.
- Public confirmation uses a non-guessable `order_number`. There is no public lookup by sequential id.
- Cancellation/restock is out of scope and must later reverse stock and ledger rows in one transaction.

## Consequences

Migration `0005_guest_checkout` is forward-only. It does not drop tables or reset volumes. Seed catalogue rows are unchanged. `POST /api/v1/checkout/guest` and admin delivery-charge routes are documented in [guest checkout](../api/guest-checkout.md) and [admin API](../api/admin.md).
