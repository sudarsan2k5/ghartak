# Ghartak admin dashboard

The dashboard in `apps/admin` manages the single central catalogue and every customer order (guest and registered). It calls the existing admin API. It does not open a database connection.

## Run it locally

Start Postgres, Redis, and the API first. The API listens on `127.0.0.1:3000`.

```sh
pnpm infra:up
pnpm --filter @ghartak/api dev
pnpm --filter @ghartak/admin dev
```

Open `http://localhost:3001`. Sign in with an administrator created by `pnpm --filter @ghartak/api admin:create`. The dashboard does not ship a password.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `apps/admin/.env.local` | API origin, with no path or credentials. Example: `http://localhost:3000` |
| `ADMIN_TRUSTED_ORIGINS` | API `.env` | Comma-separated browser origins allowed to call the admin API. Local value: `http://localhost:3001` |

When `NEXT_PUBLIC_API_BASE_URL` is unset, development uses `http://localhost:3000`. Production fails closed if the variable is missing or points at `localhost` or `127.0.0.1`. Set the public API origin at build time. `NEXT_PUBLIC_` values are visible in the browser, so this variable must stay an origin and must not contain a secret.

`pnpm --filter @ghartak/admin build` sets `NODE_ENV=production` for that command. The repo `.env` uses `NODE_ENV=development` for the API. Leaving that value in the shell during `next build` makes React resolve incorrectly and prerender `/_global-error` fails with `useContext` on null.

Use the same site for both processes during local development. `http://localhost:3001` calling `http://localhost:3000` is cross-origin and same-site, so the `SameSite=Lax` session cookie is sent. `localhost` and `127.0.0.1` are different sites. Do not mix them.

## Authentication

`POST /api/v1/admin/session` sets the `HttpOnly` cookie `ghartak_admin_session`. The JSON body contains the administrator profile and `expiresAt`. The dashboard stores that profile in memory for the account menu and does not write the session token to `localStorage` or `sessionStorage`.

Every request uses `credentials: "include"`. A protected request to `GET /api/v1/admin/products?limit=1` restores the session. `401` and `403` return the visitor to the sign-in page. `POST /api/v1/admin/logout` revokes the session and clears the cookie. A failed service check stays on an unavailable screen instead of pretending the administrator signed out.

## CORS and trusted origins

The API allows credentialed browser calls only from origins listed in `ADMIN_TRUSTED_ORIGINS`. It echoes that exact origin, sets `Access-Control-Allow-Credentials: true`, and never uses `*`. Public catalogue routes are unchanged. The existing origin check still rejects a state-changing admin request whose `Origin` is not the API host or the allowlist.

Production needs both sides to match:

- Dashboard origin, for example `https://admin.example`, in `ADMIN_TRUSTED_ORIGINS`.
- `NEXT_PUBLIC_API_BASE_URL=https://api.example`.
- Both names on the same site if the cookie stays `SameSite=Lax`. A dashboard on a different site will not receive the cookie.

Restart the API after changing `ADMIN_TRUSTED_ORIGINS`.

## Orders

`/orders` reads `GET /api/v1/admin/orders` one page at a time and `GET /api/v1/admin/orders/summary` for the cards. Search, status, payment, customer type, and date range are sent as query parameters. The list refreshes every 30 seconds while the tab is visible. It does not request notification permission.

`/orders/[orderId]` reads `GET /api/v1/admin/orders/:orderId`. Status buttons call `PATCH /api/v1/admin/orders/:orderId/status` with the next allowed status. Cancel calls `POST /api/v1/admin/orders/:orderId/cancel` with a required reason and restores stock on the server. There is no mark-as-paid action. See [admin orders API](../api/admin-orders.md).

## Products

The products page reads `GET /api/v1/admin/products` one page at a time. Search, publication status, and category are the query fields the API already accepts. Creating a product calls `POST /api/v1/admin/products` and leaves publication as draft. Editing catalogue fields calls `PATCH /api/v1/admin/products/:productId`. Price calls `PATCH /api/v1/admin/products/:productId/price`. Archiving calls `DELETE /api/v1/admin/products/:productId`, which marks the product archived. Stock changes are not on these screens.

The product list response has no image field, so photos appear only on the product page. Set `NEXT_PUBLIC_IMAGE_BASE_URL` to an http(s) origin so delivery paths can be previewed. Without it, the page still lists metadata and does not request a file. The product page can upload JPEG, PNG, and WebP stills (5 MB), edit alt text, choose the primary image, reorder, and delete with confirmation. Pending deletions cannot be edited. Failed deletions offer retry and cancel. The browser never receives R2 credentials or object keys.

## Categories

`/categories` reads `GET /api/v1/admin/categories`, which returns every category, including inactive ones, with a product count. Search and the active/inactive control filter that list in the browser. Creating a category calls `POST /api/v1/admin/categories`. A blank slug is omitted so the server derives one from the name. New categories are active unless the form says otherwise. Editing calls `PATCH /api/v1/admin/categories/:categoryId` and sends only the changed fields. Deleting calls `DELETE /api/v1/admin/categories/:categoryId`. A category that still has products returns `409` and is not deleted. The screen offers deactivation instead, which leaves the products in that category.

Product create and edit forms list active categories. A product that already uses an inactive category keeps that category in the selector so saving other fields does not move it.

## Inventory

`/inventory` reads the same `GET /api/v1/admin/products` page. Search and pagination are the supported query fields. The list does not accept an availability or out-of-stock filter, and it does not include the last movement, so the page does not invent those.

Stock changes use `POST /api/v1/admin/products/:productId/stock` with `addition`, `removal`, or `adjustment`. The dashboard shows the current quantity and the expected result, asks for confirmation, and then displays the stock quantity returned by the API. A `409` refreshes the product and does not submit again. A network failure is not retried. There is no movement-history endpoint, so the dashboard does not show a ledger.
