# Admin API

The admin API manages Ghartak's single catalogue, central price, central stock, and **all customer orders** (guest and registered). It is separate from the public catalogue. Customers and delivery partners cannot call it. Order list, detail, status, cancel, and summary routes are documented in [admin orders](admin-orders.md).

All paths are under `/api/v1`. Money is integer paise. Successful JSON responses are validated with the shared Zod contracts in `@ghartak/contracts`.

## Authentication

`POST /admin/session`

```json
{ "email": "admin@example.com", "password": "at least 12 characters" }
```

A matching active administrator receives an `HttpOnly` cookie named `ghartak_admin_session`. The cookie path is `/api/v1/admin`, `SameSite` is `Lax`, and `Max-Age` matches the session lifetime. `Secure` is set when `NODE_ENV` is production. The JSON body contains the expiry and the administrator's id, name, and email. It does not contain the session token, so browser code cannot copy it into `localStorage` or `sessionStorage`. The dashboard sends the cookie with `credentials: "include"`.

Non-browser clients can read the token from the `Set-Cookie` header and send `Authorization: Bearer <token>`. A bearer token is not sent automatically by a browser, so it is not a CSRF credential. An unknown email, a wrong password, a suspended account, and a non-admin account all return `401` with `Email or password is incorrect`.

`POST /admin/logout` revokes the current session and clears the cookie with the same name, path, `HttpOnly`, `SameSite`, and `Secure` attributes, and `Max-Age=0`. A revoked or expired token returns `401`. A token whose user is suspended, or whose admin role has been removed, is rejected on the next request.

Browser calls from another origin are allowed only when that origin is listed in `ADMIN_TRUSTED_ORIGINS`. The API echoes that exact origin and `Access-Control-Allow-Credentials: true`. It does not use `*`. Public catalogue routes do not receive these headers. A preflight may succeed only for an allowed origin. The state-changing origin check still runs on the real request.

State-changing admin requests are checked against the request origin. A browser request that carries the session cookie must send `Origin` or `Referer`, and that origin must be the API's own origin or a value in `ADMIN_TRUSTED_ORIGINS`. A cross-site `Origin` is rejected. `SameSite=Lax` does not replace this check: a same-site subdomain can still send the cookie on a POST. Set `ADMIN_TRUSTED_ORIGINS` to the dashboard origin when the dashboard is not served from the API origin, for example `https://admin.example`. Leave `trustProxy` unset. `X-Forwarded-For` is ignored, so a client cannot spoof its address. If a reverse proxy is introduced later, trust only that proxy's hop; trusting every forwarded header lets clients bypass the address limit. Sign-in counters live in the shared Redis database, so every API instance enforces the same limit.

Create the first administrator with `pnpm --filter @ghartak/api admin:create`. See [admin authentication](../security/admin-authentication.md).

## Products

| Method | Path | Effect |
| --- | --- | --- |
| GET | `/admin/products` | Page of products, including drafts and archived rows |
| POST | `/admin/products` | Create a product and its one central listing |
| GET | `/admin/products/:productId` | Product, images, price, and stock |
| PATCH | `/admin/products/:productId` | Update catalogue fields. Price and stock stay on their own routes |
| DELETE | `/admin/products/:productId` | Archive the product. It is not hard-deleted |

Creation requires a name, category, unit, pack size, package label, `pricePaise`, and `openingStockQuantity`. Opening stock above zero also requires `openingReason` and writes an `addition` movement. Zero opening stock stores `out_of_stock` and writes no movement. New products default to `draft`.

`DELETE` sets `publication_status` to `archived` and `is_active` to false. Listings, movements, and order history stay in place. The public catalogue hides the product.

Query parameters for the list are `page`, `limit` (max 50), `categoryId`, `search`, and `publicationStatus`.

## Categories

| Method | Path | Effect |
| --- | --- | --- |
| GET | `/admin/categories` | Every category, including inactive ones, with a product count |
| POST | `/admin/categories` | Create a category. The slug is derived from the name when omitted |
| PATCH | `/admin/categories/:categoryId` | Update name, slug, description, or `isActive` |
| DELETE | `/admin/categories/:categoryId` | Delete only when the category has no products |
| PUT | `/admin/categories/order` | Save the display order. `categoryIds` must list every category, or the request returns `409` |
| POST | `/admin/categories/:categoryId/image` | Upload or replace the front image (multipart, one JPEG, PNG, or WebP up to 5 MB) |
| DELETE | `/admin/categories/:categoryId/image` | Remove the front image |

A category that still has products returns `409`. Deactivate it with `isActive: false`, or move the products first. There is no separate archive column.

## Your daily everything

There are always four boxes, addressed by `position` 1 to 4.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/daily-tiles` | The four boxes with their linked category names |
| PATCH | `/admin/daily-tiles/:position` | Update `label` (1 to 40 characters) or `categoryId` (`null` opens all categories) |
| POST | `/admin/daily-tiles/:position/image` | Upload or replace the image (same file rules as category images) |
| DELETE | `/admin/daily-tiles/:position/image` | Remove the image |

## Price and stock

`PATCH /admin/products/:productId/price` with `{ "pricePaise": 6400 }` updates the single central price. Negative prices are rejected.

`POST /admin/products/:productId/stock` records a ledger row and updates stock in the same transaction. The listing row is locked for the duration.

```json
{ "type": "addition", "quantity": 4, "reason": "Delivery received" }
{ "type": "removal", "quantity": 1, "reason": "Damaged" }
{ "type": "adjustment", "quantityDelta": -2, "reason": "Count correction" }
```

A change that would make stock negative returns `409` and writes nothing. When stock reaches zero, `available` becomes `out_of_stock`. When stock rises above zero, `out_of_stock` becomes `available`. `unavailable` is left unchanged.

## Images

`POST /admin/products/:productId/images` accepts one JPEG, PNG, or WebP still as multipart form data (`file`, optional `altText`, optional `isPrimary`). Magic bytes are checked; the declared MIME type is ignored. Files must be between 1 byte and 5 MB. `Idempotency-Key` is required. The same product, key, and payload reuse the original job. A different payload with the same key returns `409`. The request stages bytes, uploads through the `image_cleanup` outbox, then inserts `product_images`. The JSON body is `{ images, image }` with delivery paths, not object keys. Storage credentials never appear in the response. `503` means the bucket is unconfigured or the object could not be stored.

`DELETE /admin/products/:productId/images/:imageId` enqueues `pending_delete`, hides the photo from the customer catalogue, deletes the object, then removes metadata. The body is `{ images, deletion: { status, imageId } }`. `status` is `pending_delete`, `deleted`, `failed`, or `cancelled`.

`POST /admin/products/:productId/images/:imageId/deletion/retry` and `.../deletion/cancel` act only on a failed delete.

`PATCH /admin/products/:productId/images/:imageId` updates alt text or the primary flag. `PUT /admin/products/:productId/images/order` with `{ "imageIds": ["..."] }` sets positions for images that are not pending deletion. A pending-delete image cannot be edited, reordered, or made primary (`409`). At most one image is primary.

Image rows may include `deletionStatus` of `pending_delete` or `failed`. They never include the object key. See [Cloudflare R2](../infrastructure/cloudflare-r2.md).

## Delivery charge

`GET /admin/settings/delivery-charge` and `PATCH /admin/settings/delivery-charge` read and update the single global Cash on Delivery delivery fee. Only an authenticated administrator may call them. There is no settings UI in this milestone.

```json
{ "deliveryFeePaise": 0 }
```

The value is integer paise, zero or greater, and at most `1000000` (₹10,000). The initial row is `delivery_fee = 0` in `app_settings`. Checkout copies the current value onto each order; changing the setting does not rewrite past totals. Customers cannot set or override the fee. There are no village-specific or merchant-specific fees.

Example:

```bash
curl -X PATCH "$API/api/v1/admin/settings/delivery-charge" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deliveryFeePaise": 2000}'
```

See [guest checkout](guest-checkout.md) for how the snapshot is applied to COD orders.
