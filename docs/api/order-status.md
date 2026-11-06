# Customer order status API

A guest who has just placed an order can read the current status and chronological timeline with the tracking token returned at checkout. There is no public lookup by order number, OTP, customer login, or admin session reuse.

All paths are under `/api/v1`. Shared Zod contracts live in `@ghartak/contracts`.

## Token

Checkout issues a 256-bit HMAC-SHA256 capability (`trackingToken`) keyed by `ORDER_TRACKING_SECRET` over a version prefix and the order UUID. That value is indistinguishable from random without the secret, and the server can recompute it on an idempotent checkout retry.

Only `SHA-256(token)` is stored on `orders.tracking_token_hash`. Tokens expire 30 days after order creation. Status reads do not extend expiry. `tracking_token_revoked_at` revokes the capability. Unknown, expired, and revoked tokens all return `404` with `not_found`.

Do not put the token in a URL or query string. Send `Authorization: Bearer <trackingToken>`.

`ORDER_TRACKING_SECRET` is required at process start (`loadEnv`). Production rejects a missing secret and the hardcoded development test value. The API process never falls back to a default secret when `NODE_ENV` is `production`. Do not commit the secret.

Rotating `ORDER_TRACKING_SECRET` changes every HMAC token. Stored hashes would no longer match, and idempotent checkout retries would mint a different capability than the one already issued. Rotation needs a versioned key strategy (accept the previous secret for existing hashes, mint with the new secret only for new orders). Do not rotate the secret in place.

## `GET /orders/status`

Success `200`:

```json
{
  "orderNumber": "GT-A1B2C3D4E5F6A7B8",
  "status": "packed",
  "updatedAt": "2026-10-31T08:15:00.000Z",
  "events": [
    { "status": "placed", "createdAt": "2026-10-31T08:00:00.000Z" },
    { "status": "confirmed", "createdAt": "2026-10-31T08:10:00.000Z" },
    { "status": "packed", "createdAt": "2026-10-31T08:15:00.000Z" }
  ]
}
```

The payload does not include customer name, phone, address, order UUID, admin actor, cancellation reason, inventory, payment provider identifiers, or idempotency keys. Cancelled orders include a `cancelled` event and timestamp only.

| Status | `error.code` | When |
| --- | --- | --- |
| 401 | `unauthorized` | Missing or malformed `Authorization` header |
| 404 | `not_found` | Unknown, expired, or revoked token |
| 429 | `rate_limited` | More than 30 requests from one IP in 60 seconds (configurable) |
| 503 | `request_error` | Redis unavailable for the rate limit |
