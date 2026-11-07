# Running GharTak locally

GharTak is a pnpm monorepo. Local development uses these services:

| Service | Location | URL or port | Started with |
| --- | --- | --- | --- |
| PostgreSQL 17 | Docker | `127.0.0.1:5433` | `pnpm infra:up` |
| Redis 7 | Docker | `127.0.0.1:6380` | `pnpm infra:up` |
| API (Fastify) | `apps/api` | http://localhost:3000 | `pnpm start` |
| Admin dashboard (Next.js) | `apps/admin` | http://localhost:3001 | `pnpm --filter ./apps/admin dev` |
| Customer app (Expo) | `apps/mobile` | Metro on port 8081 | `npx expo start` |

`apps/delivery` is only a placeholder and has nothing to run.

## Prerequisites

- Node.js 22 or newer
- pnpm 10 or newer (the repo pins `pnpm@10.19.0`)
- Docker Desktop, running
- For the customer app: Xcode with an iOS simulator, Android Studio with an emulator, or Expo Go on a phone

## First-time setup

Run these from the repo root.

```bash
# 1. Create the environment files, then edit the passwords in .env
cp .env.example .env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start PostgreSQL and Redis
pnpm infra:up

# 4. Build the API and the packages it uses
pnpm --filter '@ghartak/api...' run build

# 5. Create the tables and load sample data
pnpm db:migrate
pnpm db:seed
```

Add this line to `.env` so the admin dashboard can call the API:

```bash
ADMIN_TRUSTED_ORIGINS=http://localhost:3001
```

### Create an admin account

The dashboard needs an administrator to log in. The phone number must be in international format, such as `+919876543210`, and the password must be 12 to 128 characters. The command prompts for the password.

```bash
ADMIN_NAME="Your Name" ADMIN_EMAIL="you@example.com" ADMIN_PHONE="+919876543210" \
  pnpm --filter @ghartak/api admin:create
```

## Start the project

Make sure Docker Desktop is open, then run `pnpm infra:up`. Use a separate terminal for each app:

```bash
# Terminal 1: API
pnpm start

# Terminal 2: admin dashboard
pnpm --filter ./apps/admin dev

# Terminal 3: customer app
cd apps/mobile
npx expo start
```

In the Expo terminal, press `i` for the iOS simulator or `a` for the Android emulator, or scan the QR code with Expo Go.

The API runs from compiled code in `apps/api/dist`, so run the build command from step 4 after changing API or package code. `pnpm dev` restarts the API when `dist` changes, but it doesn't recompile anything.

## Check that it works

```bash
curl http://localhost:3000/api/v1/health
# {"status":"ok","service":"api"}

curl http://localhost:3000/api/v1/health/ready
# {"status":"ok","checks":{"postgres":"up","redis":"up"}}

curl http://localhost:3000/api/v1/categories
curl http://localhost:3000/api/v1/products
```

Then open http://localhost:3001 and log in with your admin account.

## Customer app API address

By default, the customer app calls `http://localhost:3000`. To change that, set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` and restart Expo:

| Device | Value | Extra step |
| --- | --- | --- |
| iOS simulator | `http://127.0.0.1:3000` | None |
| Android emulator | `http://10.0.2.2:3000` | None |
| Physical phone | `http://<your-computer-LAN-IP>:3000` | Set `HOST=0.0.0.0` in `.env` and restart the API |

## Tests and useful commands

Tests use the database and Redis, so run `pnpm infra:up` first.

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm --filter @ghartak/api test` | Run API tests |
| `pnpm --filter ./apps/admin test` | Run admin tests |
| `pnpm --filter ./apps/mobile test` | Run customer app tests |
| `pnpm db:verify` | Check the database schema and seed data |
| `pnpm infra:ps` | Show container status |
| `pnpm infra:logs` | Follow container logs |
| `pnpm infra:down` | Stop containers and keep their data |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | Open Docker Desktop, then run `pnpm infra:up` again |
| `Route not found` from `/health` | API routes are under `/api/v1` | Use `/api/v1/health` |
| `/api/v1/products` returns an empty list | No products are active | Activate products in the admin dashboard |
| `pnpm db:seed` fails on `product_images` | The seed is meant for an empty database and clashes with images changed since it last ran | Keep the existing data and skip the seed |
| `pnpm db:verify` reports `expected 6 catalogue images` or a price and stock failure | The catalogue no longer matches the seed data | Expected once the catalogue has been edited |
| Admin login fails or its requests are blocked | The dashboard and API are using different hostnames, or the origin isn't trusted | Use `localhost` for both, and check `ADMIN_TRUSTED_ORIGINS` |
| `Unable to resolve module react-native-web/dist/index` | The customer app doesn't include `react-native-web`, so `expo start --web` can't bundle | Use a simulator, emulator, or phone |
| Customer app shows photo placeholders | `EXPO_PUBLIC_IMAGE_BASE_URL` isn't set | Set it to your image host, or ignore it during development |

Image uploads also need all five `R2_*` values in `.env`. See [docs/infrastructure/cloudflare-r2.md](docs/infrastructure/cloudflare-r2.md).
