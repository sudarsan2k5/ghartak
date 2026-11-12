import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { errorResponseSchema, productDetailResponseSchema } from "@ghartak/contracts";
import {
  adminSessions,
  categories,
  closeDatabase,
  inventoryMovements,
  openDatabase,
  productImages,
  products,
  storeProducts,
  userRoles,
  users,
  type Database,
} from "@ghartak/database";
import { eq, inArray, like } from "drizzle-orm";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { HttpError } from "../src/http/errors.js";
import { clearSessionCookie, sessionCookie } from "../src/modules/admin/auth/session.js";
import { hashSessionToken } from "../src/modules/admin/auth/session.js";
import { assertImageUpload, catalogueDeliveryPath, catalogueObjectKey } from "../src/modules/admin/images/image-policy.js";
import { createLogger } from "../src/logger.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const password = "correct-horse-battery";
const adminEmail = `admin-${suffix}@example.com`;
const customerEmail = `customer-${suffix}@example.com`;

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let cookieHeader = "";
let adminId = "";

describe("admin catalogue", () => {
  before(async () => {
    const connectionString = process.env["DATABASE_URL"];
    const redisUrl = process.env["REDIS_URL"];
    if (!connectionString || !redisUrl) {
      throw new Error("DATABASE_URL and REDIS_URL are required");
    }
    db = openDatabase(connectionString);
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    await cleanup(db);
    const admin = await createAdministrator(db, {
      name: "Test Admin",
      email: adminEmail,
      phone: phoneFrom(suffix, "8"),
      password,
    });
    adminId = admin.id;
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `admin-test:${suffix}`,
        trustedOrigins: [],
      },
      imageStorage: null,
    });
    const session = await login(app, adminEmail, password);
    token = session.token;
    cookieHeader = session.cookie;
  });

  after(async () => {
    await cleanup(db);
    await redis.quit();
    await app.close();
    await closeDatabase();
  });

  it("rejects an unknown email and a wrong password with the same message", async () => {
    const unknown = await loginRaw(app, `missing-${suffix}@example.com`, password);
    const wrong = await loginRaw(app, adminEmail, "not-the-real-password");
    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(unknown.json(), wrong.json());
    assert.equal(errorResponseSchema.parse(unknown.json()).error.message, "Email or password is incorrect");
  });

  it("rejects unauthenticated, revoked, expired, and non-admin access", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/v1/admin/products" });
    assert.equal(missing.statusCode, 401);

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/admin/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(logout.statusCode, 204);
    const cleared = logout.headers["set-cookie"];
    const clearedHeader = Array.isArray(cleared) ? cleared[0] : cleared;
    assert.match(clearedHeader ?? "", /ghartak_admin_session=;/);
    assert.match(clearedHeader ?? "", /HttpOnly/);
    assert.match(clearedHeader ?? "", /SameSite=Lax/);
    assert.match(clearedHeader ?? "", /Path=\/api\/v1\/admin/);
    assert.match(clearedHeader ?? "", /Max-Age=0/);
    const reused = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(reused.statusCode, 401);
    token = (await login(app, adminEmail, password)).token;
    cookieHeader = `ghartak_admin_session=${token}`;

    const expiredToken = randomUUID();
    await db.insert(adminSessions).values({
      userId: adminId,
      tokenHash: hashSessionToken(expiredToken),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const expired = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products",
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expired.statusCode, 401);

    const customer = await insertCustomer(db);
    const customerToken = randomUUID();
    await db.insert(adminSessions).values({
      userId: customer.id,
      tokenHash: hashSessionToken(customerToken),
      createdAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products",
      headers: { authorization: `Bearer ${customerToken}` },
    });
    assert.equal(forbidden.statusCode, 403);
  });

  it("accepts the session cookie and rejects a foreign origin", async () => {
    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products",
      headers: { cookie: cookieHeader },
    });
    assert.equal(listed.statusCode, 200, listed.body);
    const secure = sessionCookie("token-value", 3600, true);
    const cleared = clearSessionCookie(true);
    assert.match(secure, /Secure/);
    assert.match(cleared, /Secure/);
    assert.match(cleared, /Max-Age=0/);
    assert.match(cleared, /Path=\/api\/v1\/admin/);

    const foreign = await app.inject({
      method: "POST",
      url: "/api/v1/admin/logout",
      headers: { cookie: cookieHeader, origin: "https://evil.example", host: "127.0.0.1:3000" },
    });
    assert.equal(foreign.statusCode, 403);

    const sameOrigin = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${randomUUID()}`,
      headers: { cookie: cookieHeader, origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
      payload: {},
    });
    assert.equal(sameOrigin.statusCode, 400);

    const loginForeign = await app.inject({
      method: "POST",
      url: "/api/v1/admin/session",
      headers: { origin: "https://evil.example", host: "127.0.0.1:3000" },
      payload: { email: adminEmail, password },
    });
    assert.equal(loginForeign.statusCode, 403);

    const corsApp = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 8,
        loginWindowSeconds: 900,
        rateLimitPrefix: `admin-cors:${suffix}`,
        trustedOrigins: ["http://localhost:3001"],
      },
    });
    try {
      const preflight = await corsApp.inject({
        method: "OPTIONS",
        url: "/api/v1/admin/session",
        headers: {
          origin: "http://localhost:3001",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      assert.equal(preflight.statusCode, 204);
      assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:3001");
      assert.equal(preflight.headers["access-control-allow-credentials"], "true");

      const blocked = await corsApp.inject({
        method: "OPTIONS",
        url: "/api/v1/admin/session",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      });
      assert.equal(blocked.headers["access-control-allow-origin"], undefined);

      const catalogue = await corsApp.inject({
        method: "GET",
        url: "/api/v1/categories",
        headers: { origin: "http://localhost:3001" },
      });
      assert.equal(catalogue.headers["access-control-allow-origin"], undefined);

      const signedIn = await corsApp.inject({
        method: "POST",
        url: "/api/v1/admin/session",
        headers: { origin: "http://localhost:3001", host: "127.0.0.1:3000" },
        payload: { email: adminEmail, password },
      });
      assert.equal(signedIn.statusCode, 200);
      assert.equal(signedIn.headers["access-control-allow-origin"], "http://localhost:3001");
      assert.equal(JSON.parse(signedIn.body).token, undefined);
    } finally {
      await corsApp.close();
    }

    await db.update(users).set({ status: "suspended" }).where(eq(users.id, adminId));
    try {
      const suspended = await app.inject({
        method: "GET",
        url: "/api/v1/admin/products",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(suspended.statusCode, 401);
    } finally {
      await db.update(users).set({ status: "active" }).where(eq(users.id, adminId));
    }

    await db.delete(userRoles).where(eq(userRoles.userId, adminId));
    try {
      const demoted = await app.inject({
        method: "GET",
        url: "/api/v1/admin/products",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(demoted.statusCode, 403);
    } finally {
      await db.insert(userRoles).values({ userId: adminId, role: "admin" });
    }
  });

  it("limits repeated sign-in attempts", async () => {
    const limited = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60,
        secureCookies: false,
        loginLimit: 2,
        loginWindowSeconds: 900,
        rateLimitPrefix: `admin-rate:${suffix}`,
        trustedOrigins: [],
      },
    });
    const email = `limited-${suffix}@example.com`;
    const first = await loginRaw(limited, email, password);
    const second = await loginRaw(limited, email, password);
    const third = await loginRaw(limited, email, password);
    assert.equal(first.statusCode, 401);
    assert.equal(second.statusCode, 401);
    assert.equal(third.statusCode, 429);
    await limited.close();
  });

  it("creates, updates, publishes, and archives a product", async () => {
    const category = await createCategory(app, token, `Admin ${suffix}`);
    const created = await send(app, token, "POST", "/api/v1/admin/products", {
      name: `Admin Dal ${suffix}`,
      brand: "Ghartak",
      description: "Split peas for the admin test",
      categoryId: category.id,
      packageLabel: "1 kg",
      publicationStatus: "published",
      pricePaise: 9900,
      openingStockQuantity: 4,
    });
    assert.equal(created.statusCode, 200, created.body);
    const product = created.json() as { id: string; publicationStatus: string; inventory: { stockQuantity: number } };
    assert.equal(product.inventory.stockQuantity, 4);
    const [opening] = await db
      .select({ actorUserId: inventoryMovements.actorUserId })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, product.id));
    assert.equal(opening?.actorUserId, adminId);

    const visible = await app.inject({ method: "GET", url: `/api/v1/products/${product.id}` });
    assert.equal(visible.statusCode, 200);
    assert.equal(productDetailResponseSchema.parse(visible.json()).name, `Admin Dal ${suffix}`);

    const updated = await send(app, token, "PATCH", `/api/v1/admin/products/${product.id}`, {
      publicationStatus: "draft",
      brand: "Ghartak Staples",
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal((updated.json() as { publicationStatus: string }).publicationStatus, "draft");

    const hidden = await app.inject({ method: "GET", url: `/api/v1/products/${product.id}` });
    assert.equal(hidden.statusCode, 404);

    const archived = await send(app, token, "DELETE", `/api/v1/admin/products/${product.id}`);
    assert.equal(archived.statusCode, 200, archived.body);
    const archivedBody = archived.json() as { publicationStatus: string; isActive: boolean };
    assert.equal(archivedBody.publicationStatus, "archived");
    assert.equal(archivedBody.isActive, false);
  });

  it("manages categories and refuses to delete one that still has products", async () => {
    const category = await createCategory(app, token, `Shelf ${suffix}`);
    await send(app, token, "POST", "/api/v1/admin/products", {
      name: `Shelf Item ${suffix}`,
      categoryId: category.id,
      packageLabel: "1 pc",
      pricePaise: 100,
      openingStockQuantity: 0,
    });
    const denied = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/categories/${category.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(denied.statusCode, 409);

    const empty = await createCategory(app, token, `Empty ${suffix}`);
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/categories/${empty.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(removed.statusCode, 204);
  });

  it("updates the central price and keeps the inventory ledger consistent", async () => {
    const category = await createCategory(app, token, `Stock ${suffix}`);
    const created = await send(app, token, "POST", "/api/v1/admin/products", {
      name: `Stock Item ${suffix}`,
      categoryId: category.id,
      packageLabel: "1 kg",
      pricePaise: 5000,
      openingStockQuantity: 5,
    });
    const productId = (created.json() as { id: string }).id;
    const priced = await send(app, token, "PATCH", `/api/v1/admin/products/${productId}/price`, { pricePaise: 6400 });
    assert.equal(priced.statusCode, 200, priced.body);
    assert.equal((priced.json() as { inventory: { pricePaise: number } }).inventory.pricePaise, 6400);

    const negative = await send(app, token, "PATCH", `/api/v1/admin/products/${productId}/price`, { pricePaise: -1 });
    assert.equal(negative.statusCode, 400);

    const [added, addedAgain] = await Promise.all([
      send(app, token, "POST", `/api/v1/admin/products/${productId}/stock`, {
        type: "addition",
        quantity: 1,
        reason: "Delivery received",
      }),
      send(app, token, "POST", `/api/v1/admin/products/${productId}/stock`, {
        type: "addition",
        quantity: 1,
        reason: "Second delivery",
      }),
    ]);
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(addedAgain.statusCode, 200, addedAgain.body);
    const stocks = [added.json(), addedAgain.json()].map(
      (body) => (body as { inventory: { stockQuantity: number } }).inventory.stockQuantity,
    );
    assert.deepEqual(stocks.sort((left, right) => left - right), [6, 7]);

    const removed = await send(app, token, "POST", `/api/v1/admin/products/${productId}/stock`, {
      type: "removal",
      quantity: 100,
      reason: "Too many",
    });
    assert.equal(removed.statusCode, 409);

    const adjusted = await send(app, token, "POST", `/api/v1/admin/products/${productId}/stock`, {
      type: "adjustment",
      quantityDelta: -2,
      reason: "Count correction",
    });
    assert.equal(adjusted.statusCode, 200, adjusted.body);
    assert.equal((adjusted.json() as { inventory: { stockQuantity: number } }).inventory.stockQuantity, 5);

    const [listing] = await db.select().from(storeProducts).where(eq(storeProducts.productId, productId));
    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.storeProductId, listing!.id));
    const delta = movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
    assert.equal(delta, listing!.stockQuantity);
    assert.equal(movements.length, 4);
    assert.ok(movements.every((movement) => movement.stockAfter >= 0 && movement.actorUserId === adminId));
  });

  it("requires an administrator before it reports that image storage is not configured", async () => {
    assert.throws(() => assertImageUpload({ contentType: "image/gif", byteLength: 10 }));
    assert.throws(() => assertImageUpload({ contentType: "image/jpeg", byteLength: 0 }));
    const productId = randomUUID();
    const imageId = randomUUID();
    assert.equal(catalogueObjectKey(productId, imageId, "image/jpeg"), `catalog/${productId}/${imageId}.jpg`);
    assert.equal(catalogueDeliveryPath(productId, imageId, "image/png").includes(".."), false);

    const anonymous = await app.inject({ method: "POST", url: `/api/v1/admin/products/${productId}/images` });
    assert.equal(anonymous.statusCode, 401);
    const unavailable = await app.inject({
      method: "POST",
      url: `/api/v1/admin/products/${productId}/images`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(errorResponseSchema.parse(unavailable.json()).error.message, "Image storage is not configured");
  });

  it("fails closed when the login counter is unavailable", async () => {
    const { loadEnv } = await import("@ghartak/config");
    assert.throws(() =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://ghartak:secret@127.0.0.1:5432/ghartak",
        REDIS_URL: "redis://127.0.0.1:6379",
        R2_BUCKET: "only-one",
      }),
    );
    const broken = await buildApp({
      logger: createLogger("silent"),
      db,
      redis: {
        eval: async () => {
          throw new Error("redis down");
        },
      } as unknown as Redis,
      auth: {
        sessionTtlSeconds: 60,
        secureCookies: true,
        loginLimit: 2,
        loginWindowSeconds: 60,
        rateLimitPrefix: `admin-down:${suffix}`,
        trustedOrigins: ["https://admin.example"],
      },
    });
    const response = await loginRaw(broken, adminEmail, password);
    assert.equal(response.statusCode, 503);
    await broken.close();
    await assert.rejects(
      () =>
        createAdministrator(db, {
          name: "Test Admin",
          email: adminEmail,
          phone: phoneFrom("other", "6"),
          password,
        }),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409,
    );
  });
});

async function login(current: Awaited<ReturnType<typeof buildApp>>, email: string, value: string) {
  const response = await loginRaw(current, email, value);
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as { token?: string; admin: { id: string } };
  assert.equal(body.token, undefined);
  const header = response.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : header;
  assert.equal(typeof raw, "string");
  const match = /ghartak_admin_session=([^;]+)/.exec(raw ?? "");
  assert.ok(match?.[1]);
  assert.match(raw ?? "", /HttpOnly/);
  assert.match(raw ?? "", /SameSite=Lax/);
  assert.match(raw ?? "", /Path=\/api\/v1\/admin/);
  assert.equal((raw ?? "").includes("Secure"), false);
  return { token: match[1], cookie: `ghartak_admin_session=${match[1]}` };
}

function loginRaw(current: Awaited<ReturnType<typeof buildApp>>, email: string, value: string) {
  return current.inject({
    method: "POST",
    url: "/api/v1/admin/session",
    payload: { email, password: value },
  });
}

async function send(
  current: Awaited<ReturnType<typeof buildApp>>,
  bearer: string,
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  return current.inject({
    method,
    url,
    headers: { authorization: `Bearer ${bearer}` },
    ...(payload ? { payload } : {}),
  });
}

async function createCategory(current: Awaited<ReturnType<typeof buildApp>>, bearer: string, name: string) {
  const response = await send(current, bearer, "POST", "/api/v1/admin/categories", { name });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { id: string };
}

async function insertCustomer(database: Database) {
  const [user] = await database
    .insert(users)
    .values({
      name: "Test Customer",
      phone: phoneFrom(`${suffix}c`, "7"),
      email: customerEmail,
      status: "active",
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("customer fixture missing");
  }
  await database.insert(userRoles).values({ userId: user.id, role: "customer" });
  return user;
}

function phoneFrom(value: string, lead: string): string {
  const digits = `${lead}${value.replace(/\D/g, "")}`.padEnd(10, "0").slice(0, 10);
  return `+91${digits}`;
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database
    .select({ id: products.id })
    .from(products)
    .where(like(products.name, `% ${suffix}`));
  const productIds = productRows.map((row) => row.id);
  if (productIds.length > 0) {
    const listings = await database
      .select({ id: storeProducts.id })
      .from(storeProducts)
      .where(inArray(storeProducts.productId, productIds));
    const listingIds = listings.map((row) => row.id);
    if (listingIds.length > 0) {
      await database.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listingIds));
      await database.delete(storeProducts).where(inArray(storeProducts.id, listingIds));
    }
    await database.delete(productImages).where(inArray(productImages.productId, productIds));
    await database.delete(products).where(inArray(products.id, productIds));
  }
  await database.delete(categories).where(like(categories.slug, `%${suffix}%`));
  const people = await database
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%${suffix}@example.com`));
  const userIds = people.map((person) => person.id);
  if (userIds.length > 0) {
    await database.delete(adminSessions).where(inArray(adminSessions.userId, userIds));
    await database.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await database.delete(users).where(inArray(users.id, userIds));
  }
}
