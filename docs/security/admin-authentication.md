# Admin authentication

## What was already there

`users.email` is optional and unique when present. `users.phone` is required. `user_roles.role` already includes `admin`, `customer`, and `delivery_partner`. There was no password hash, no session table, and no authentication code.

## Decisions

- Passwords are hashed with Argon2id (`memoryCost` 19456, `timeCost` 2, `parallelism` 1) and stored in nullable `users.password_hash`. The database accepts only an Argon2id encoded hash, or null for accounts that cannot sign in. Plain text is never stored or logged.
- Admin sign-in is email and password. It does not use an external identity provider. Phone remains required by the existing user row, so the bootstrap command asks for one.
- Sessions are random 32-byte tokens. Only the SHA-256 hash is stored in `admin_sessions`. A session expires after 12 hours by default (`ADMIN_SESSION_TTL_SECONDS`) and can be revoked on logout. Deleting the user cascades to that user's sessions.
- The API sets `ghartak_admin_session` as an `HttpOnly`, `SameSite=Lax` cookie on path `/api/v1/admin`. `Max-Age` matches the session lifetime. The cookie is `Secure` when `NODE_ENV` is production. Logout clears it with those same attributes. The login JSON does not include the raw token. A browser dashboard authenticates with the cookie and must not persist a bearer token. Non-browser tools may copy the token from `Set-Cookie` and send it as `Authorization: Bearer`.
- Credentialed CORS is enabled for `/api/v1/admin` only. The allowed origin is the request `Origin` when it appears in `ADMIN_TRUSTED_ORIGINS`. The response sets `Access-Control-Allow-Credentials: true` and never `*`. A missing or unknown origin receives no allow-origin header. This does not replace the origin check below.
- Cookie-authenticated changes, and any admin change that sends an `Origin`, must match the API origin or `ADMIN_TRUSTED_ORIGINS`. `SameSite=Lax` blocks a foreign site from attaching the cookie to a POST, but it does not block another subdomain of the same site. Configure the allowlist before serving the dashboard from a different origin.
- `request.ip` is the direct peer. Forwarded headers are not trusted. Rate-limit keys are in shared Redis, so all API instances share one counter. Redis errors fail closed. The counter sets its expiry inside the increment script so a crash cannot leave an unlimited key.
- Every `/api/v1/admin` route except `POST /admin/session` requires an unexpired, unrevoked session for an active user with the `admin` role. Customers and delivery partners receive `403`.
- Logs redact authorization headers, cookies, password fields, tokens, and the R2 secret. Stock and price logs record the actor, product, and resulting quantity. They do not record the password or token.

## Create the first administrator

Build the API, then run the command from the repository root. Set the identity in the environment for that process only. Do not commit `ADMIN_PASSWORD`, and unset it after the command.

```sh
pnpm --filter @ghartak/api build
ADMIN_NAME="Asha Rao" \
ADMIN_EMAIL="asha@ghartak.example" \
ADMIN_PHONE="+919800000000" \
ADMIN_PASSWORD="replace-with-a-long-password" \
pnpm --filter @ghartak/api admin:create
unset ADMIN_PASSWORD
```

The password must be 12 to 128 characters. A missing or invalid name, email, phone, or password is rejected before a row is written, and the error names the field without printing the password. Interactive entry does not echo the password. The command refuses an email or phone that already exists. The user row and the admin role are inserted in one transaction, after the password has been hashed. It does not create an account when those variables are missing, and it does not ship a default password.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_SESSION_TTL_SECONDS` | `43200` | Session lifetime, from 5 minutes to 14 days |
| `ADMIN_LOGIN_LIMIT` | `8` | Sign-in attempts allowed in the window |
| `ADMIN_LOGIN_WINDOW_SECONDS` | `900` | Rate-limit window |
| `ADMIN_TRUSTED_ORIGINS` | empty | Comma-separated http(s) origins allowed to call the admin API from a browser, in addition to the API's own origin |

`DATABASE_URL` and `REDIS_URL` are still required. Do not enable Fastify `trustProxy` until the process is reached only through a known proxy. R2 variables are unrelated to sign-in and stay unset until a bucket exists.
