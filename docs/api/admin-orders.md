# Admin order management API

Administrators inspect, advance, and cancel **every** customer order through one set of routes. Guest orders (`orders.user_id` is null) and registered-customer orders (`orders.user_id` is set) share the same `orders` table. There is no guest-only filter and no second order system.

All paths are under `/api/v1`. Admin authentication is required (session cookie or `Authorization: Bearer`). Customers and delivery partners receive `401` or `403`. Money is integer paise. Shared Zod contracts live in `@ghartak/contracts`.

Public guest checkout is unchanged. There is still no public GET for an order by sequential id or order number.

## Status values

The database enum is reused. Mapping from the intended business names:

| Business name | Stored status |
| --- | --- |
| Pending | `placed` |
| Confirmed | `confirmed` |
| Preparing | `packed` |
| Out for delivery | `out_for_delivery` |
| Delivered | `delivered` |
| Cancelled | `cancelled` |

Forward transitions allowed by `PATCH .../status`:

`placed → confirmed → packed → out_for_delivery → delivered`

`delivered` and `cancelled` are terminal. Cancellation is only `POST .../cancel`. Invalid transitions return `409` with `invalid_status_transition`. COD `payment_status` stays `pending` through confirmation, packing, dispatch, and delivery. Mark-as-paid is a later milestone.

## `GET /admin/orders`

Newest first. Query:

| Parameter | Default | Notes |
| --- | --- | --- |
| `page` | 1 | |
| `limit` | 20 | Max 100 |
| `status` | | One stored status |
| `paymentStatus` | | Order payment status |
| `paymentMethod` | | Including `cash_on_delivery` |
| `customerType` | omitted | `guest` or `registered`. Optional; omitting returns both |
| `orderNumber` | | Case-insensitive exact match |
| `customerName` | | Case-insensitive contains on the address snapshot |
| `customerPhone` | | Snapshot phone; 10-digit Indian numbers are normalized to E.164 |
| `createdFrom` / `createdTo` | | ISO-8601 timestamps |

Customer name and phone come from `order_addresses`, not from the current user profile.

```json
{
  "orders": [
    {
      "id": "…",
      "orderNumber": "GT-A1B2C3D4E5F6A7B8",
      "customerName": "Ramu",
      "customerPhone": "+919876543210",
      "customerType": "guest",
      "status": "placed",
      "paymentMethod": "cash_on_delivery",
      "paymentStatus": "pending",
      "itemCount": 2,
      "subtotalPaise": 24000,
      "deliveryFeePaise": 0,
      "totalPaise": 24000,
      "createdAt": "2026-10-30T18:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pageCount": 1 }
}
```

## `GET /admin/orders/:orderId`

`:orderId` is a UUID. Unknown ids return `404`.

The payload includes order timestamps, customer type, snapshot name and phone, `userId` when registered, the full address snapshot (guest free-text stays on `line1`), item name/price snapshots, financial snapshots, payment provider/amount/status **without** idempotency keys, and status history with acting admin `{ id, name }` when present.

Current catalogue prices and the customer's current profile are not applied.

## `GET /admin/orders/summary`

Optional `createdFrom` / `createdTo`. With no dates, every historical order is counted.

| Field | Meaning |
| --- | --- |
| `totalOrders` | All matching orders |
| `placed` … `cancelled` | Counts by stored status (`packed` is preparing) |
| `guestOrders` | `user_id IS NULL` |
| `registeredOrders` | `user_id IS NOT NULL` |
| `codAwaitingPaymentCount` | COD orders whose **order** `payment_status` is `pending` and status is not `cancelled` |
| `codAwaitingCollectionPaise` | Sum of those orders' `total_paise` |

Pending COD is **not** treated as collected revenue. Amounts are taken from `orders.total_paise` (one row per order) so multiple `payments` rows cannot double-count. Cancelled COD is excluded. Delivered-but-still-pending COD remains awaiting collection until a future mark-as-paid API exists.

## `PATCH /admin/orders/:orderId/status`

```json
{ "status": "confirmed" }
```

Allowed values: `confirmed`, `packed`, `out_for_delivery`, `delivered`. The order row is locked. The previous and new status, and the acting administrator, are written to `order_status_events` in the same transaction. Concurrent updates serialize on the lock; the loser sees the new status and receives `409`.

## `POST /admin/orders/:orderId/cancel`

```json
{ "reason": "Customer asked to stop" }
```

`reason` is required (1–200 characters). One transaction:

1. Lock the order.
2. Reject if already `cancelled` (`409 already_cancelled`) or `delivered` (`409 cannot_cancel_delivered`).
3. Read item quantities from `order_items` (checkout snapshots, not current catalogue stock).
4. Lock `store_products` in product-id order.
5. Add those quantities back, write `addition` movements (`reason: order_cancel:{orderNumber}`, `actor_user_id` = admin).
6. Set status `cancelled` and record the event with the reason and admin.

A second cancel never restocks. Concurrent cancels serialize on the order lock. Payment rows are not changed. Guest and registered orders use this same path.

## Errors

| Status | Typical `error.code` |
| --- | --- |
| 400 | Validation (`request_error`) |
| 401 | Unauthenticated |
| 403 | Authenticated non-admin |
| 404 | Unknown order UUID |
| 409 | `invalid_status_transition`, `already_cancelled`, `cannot_cancel_delivered` |

Logs record `actorUserId`, `orderId`, `orderNumber`, and status. They do not record phones, addresses, tokens, or idempotency keys.
