# Cloudflare R2

Product photos are metadata in `product_images` plus objects in a private R2 bucket. The database stores `storage_provider` (`r2`), an object key, and a delivery path. It does not store credentials or file bytes.

## Current status

Admin upload and deletion HTTP routes are enabled when R2 is configured. They use the PostgreSQL `image_cleanup` outbox: stage bytes, put or delete the object, then write `product_images`. If R2 is not configured, those routes still authenticate and return `503`. Reordering and alt text updates work on existing rows. Pending-delete rows are hidden from the customer catalogue.

Do not treat configured credentials as proof that the bucket is reachable. `createImageStorage().verify()` sends `HeadBucket` and must receive HTTP 200. Lifecycle primitives fail closed if verification fails.

## Required configuration

Set all of these, or none of them. The API rejects a partial set.

| Variable | Purpose |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id, used only to form the S3 endpoint |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret. Backend only. Never send it to the customer app or the admin browser |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | `https` origin with no user, password, or path. The public host for delivery paths |

Object keys are `catalog/{productId}/{imageId}.{jpg|png|webp}`. The delivery path stored for customers is the same key with a leading slash. Customer and admin responses omit the object key.

Accepted uploads are JPEG, PNG, and WebP stills between 1 byte and 5 MB. Detection uses file signatures, not the client MIME type. GIF, SVG, and animated PNG/WebP are rejected.

## Why deletion cannot be one transaction

PostgreSQL and R2 are separate systems. A database transaction cannot commit or roll back an R2 object. The `image_cleanup` table is the durable outbox for that gap. It never stores credentials, access tokens, or image bytes.

## Outbox state machine

`operation = upload`

| From | To | Meaning |
| --- | --- | --- |
| `pending_upload` | `uploaded` | The object was put. The row is not yet a customer-visible `product_images` record |
| `pending_upload` | `abandoned` | Put failed after retries, or restart lost the staged bytes so the object was deleted if present |
| `pending_upload` | `failed` | Retry budget exhausted while still pending |
| `uploaded` | `stored` | `product_images` was inserted. The image may appear in the catalogue |
| `uploaded` | `abandoned` | Object deleted after a recovery decision that it cannot be stored |
| `uploaded` | `failed` | Retry budget exhausted after the object existed |
| `stored` | — | Terminal success |

`operation = delete`

| From | To | Meaning |
| --- | --- | --- |
| `pending_delete` | `deleted` | Object delete succeeded or the object was already missing, then `product_images` was removed |
| `pending_delete` | `failed` | Retry budget exhausted |
| `deleted` | — | Terminal success |

`failed` and `abandoned` are terminal. Operators inspect `last_error`, `attempt_count`, and `object_key`. `last_error` is truncated and stripped of URLs and credential-like text.

## Upload recovery

1. Validate content type and size.
2. Verify the bucket with `HeadBucket`.
3. Write the bytes to the shared staging directory (`IMAGE_STAGING_DIR`, or the process temp directory when unset), then insert `pending_upload`. PostgreSQL never stores the bytes. Every API process on this host must use the same directory. Processes on different hosts are not safe until that directory is shared storage.
4. Put the object with the existing `createImageStorage()` client.
5. Mark the outbox `uploaded`.
6. Insert `product_images` and mark the outbox `stored` in one database transaction.

If the put fails, the job stays `pending_upload` and retries with exponential backoff (1s, 2s, 4s, … capped at 15 minutes, default 8 attempts). If the put succeeds and marking `uploaded` fails, retry overwrites the same key while the staged body remains.

If the process restarts before `uploaded`, the staged body is gone. The worker deletes the object key (idempotent if missing) and marks the job `abandoned`. The operator re-submits the upload later. That is the chosen trade-off instead of writing image bytes into PostgreSQL or an untested disk queue.

If `uploaded` is recorded and inserting `product_images` fails, the worker retries the database insert. It does not require the image bytes. Repeating the insert is safe because the image id and object key are stable.

## Deletion recovery

1. Verify the bucket.
2. Insert `pending_delete` with the existing object key **before** deleting the object. A second request for the same image returns the same pending row.
3. Catalogue queries hide rows with a `pending_delete` or failed delete outbox job. The `product_images` row and object key remain until cleanup finishes.
4. Delete the R2 object. A missing object is success.
5. Delete the `product_images` row and mark the outbox `deleted`.

If R2 delete fails, the job stays `pending_delete` and retries. If R2 delete succeeds and the database update fails, retry deletes again (missing object is success) and then removes metadata.

## Worker

There is no separate queue service. `createImageCleanupWorker()` claims due rows with `SELECT … FOR UPDATE SKIP LOCKED` and stores a new `claim_token`. Every later status change updates only the row that still has that token and the expected status. While an R2 call runs, the worker refreshes `claimed_at`. The lease is two minutes. A replacement worker may claim a job only after the lease is stale. A worker that loses its token stops. It does not delete the object.

`max_attempts` is the number of times a job is executed. The execution that reaches the limit is stored as `failed` instead of being delayed again.

A failed delete stays in `image_cleanup` with its object key. The image is visible again. An administrator can retry it (`pending_delete`, hidden while that runs) or cancel it (`cancelled`, image stays visible, key kept). `POST /admin/products/:productId/images/:imageId/deletion/retry` and `.../deletion/cancel` do that.

Terminal rows can be copied to `image_cleanup_archive` (no product foreign key) and removed from `image_cleanup`. That keeps the object key for audit and allows a later hard delete of the product. Non-terminal rows still restrict product deletion. The admin product API still archives products; it does not hard-delete them.

HeadBucket success is cached for 30 seconds per storage client. A failed verification is not cached.

Admin upload and delete requests call `settle()` so the HTTP response waits for the current job. There is still no background timer in the API process. Remaining retries after a 503 can be processed by a later, reviewed scheduler or another request that settles a due job.

The S3 endpoint is `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` with region `auto`. Credentials stay in the API process environment.
