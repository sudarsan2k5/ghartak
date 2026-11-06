# 0006 — Admin authentication

Status: accepted

## Context

Ghartak administrators will manage the one central catalogue. `users` already has an optional email and a required phone. `user_roles` already has an `admin` role. There was no password storage and no session record. Customer sign-in is not part of this work.

## Decisions

- Add nullable `users.password_hash`. Only an Argon2id encoded hash may be stored. Existing rows stay null.
- Add `admin_sessions`, keyed by a SHA-256 hash of a random token. Sessions expire and can be revoked. Deleting a user deletes those sessions.
- The first administrator is created with `pnpm --filter @ghartak/api admin:create`. There is no seeded or hardcoded password.
- Product deletion archives the row because listings and stock movements are restricted foreign keys. Category deletion is allowed only when the category has no products.
- Stock changes lock the central listing and insert `inventory_movements` in the same transaction. Price stays integer paise.
- R2 credentials are optional environment variables. Upload and object deletion stay unavailable until a bucket is configured and verified.

## Consequences

Migration `0004_admin_auth` is forward-only. Public catalogue reads are unchanged. The admin dashboard UI is later work.
