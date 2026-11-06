import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  customerOrderStatusResponseSchema,
  errorResponseSchema,
  guestCheckoutResponseSchema,
} from "@ghartak/contracts";
import {
  adminSessions,
  categories,
  closeDatabase,
  guestCheckoutRequests,
  inventoryMovements,
  openDatabase,
  orderAddresses,
  orderItems,
  orders,
  orderStatusEvents,
  payments,
  products,
  storeProducts,
  stores,
  userRoles,
  users,
  type Database,
} from "@ghartak/database";
import { eq, inArray, like } from "drizzle-orm";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { hashTrackingToken, issueTrackingToken } from "../src/modules/orders/tracking-token.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const skuPrefix = `TRK-${suffix}`;
const password = "correct-horse-battery";
const adminEmail = `trk-admin-${suffix.toLowerCase()}@example.com`;
const trackingSecret = `trk-secret-${suffix.toLowerCase()}-order-tracking-key`;

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let adminCookie = "";
let productId = "";
let secondProductId = "";
let storeId = "";

describe("customer order status", () => {
  before(async () => {
    const connectionString = process.env["DATABASE_URL"];
    const redisUrl = process.env["REDIS_URL"];
    if (!connectionString || !redisUrl) {
      throw new Error("DATABASE_URL and REDIS_URL are required");
    }
    db = openDatabase(connectionString);
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    await cleanup(db);
    const [store] = await db.select({ id: stores.id }).from(stores).limit(1);
    if (!store) {
      throw new Error("fulfilment location is missing");
    }
    storeId = store.id;
    const fixtures = await insertFixtures(db, storeId);
    productId = fixtures.productId;
    secondProductId = fixtures.secondProductId;
    await createAdministrator(db, {
      name: "Tracking Admin",
      email: adminEmail,
      phone: phoneFrom(suffix, "6"),
      password,
    });
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `trk-admin:${suffix}`,
        trustedOrigins: [],
      },
      checkout: {
        checkoutLimit: 200,
        checkoutWindowSeconds: 600,
        checkoutRatePrefix: `trk-guest:${suffix}`,
      },
      tracking: {
        secret: trackingSecret,
        statusLimit: 200,
        statusWindowSeconds: 60,
        statusRatePrefix: `trk-status:${suffix}`,
      },
    });
    adminCookie = await login(app, adminEmail, password);
  });

  after(async () => {
    await cleanup(db);
    await redis.quit();
    await app.close();
    await closeDatabase();
  });

  it("returns the placed status and timeline for a successful checkout token", async () => {
    const placed = await placeGuest(app, {
      customerName: "Ramu",
      customerPhone: "9876543210",
      deliveryAddress: "House near the school",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("placed"),
    });
    const status = await orderStatus(app, placed.trackingToken);
    assert.equal(status.statusCode, 200, status.body);
    const body = customerOrderStatusResponseSchema.parse(status.json());
    assert.equal(body.orderNumber, placed.orderNumber);
    assert.equal(body.status, "placed");
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0]?.status, "placed");
    assert.equal("note" in (body.events[0] ?? {}), false);
    assert.equal("customerName" in body, false);
    assert.equal("customerPhone" in body, false);
    assert.equal("id" in body, false);
    assert.equal("reason" in body, false);
  });

  it("replays the same tracking token on idempotent retry without storing plaintext", async () => {
    const payload = {
      customerName: "Replay",
      customerPhone: "9876543211",
      deliveryAddress: "Replay house",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("replay"),
    };
    const first = await placeGuest(app, payload);
    const [stored] = await db
      .select({ response: guestCheckoutRequests.response, orderId: guestCheckoutRequests.orderId })
      .from(guestCheckoutRequests)
      .where(eq(guestCheckoutRequests.idempotencyKey, payload.idempotencyKey));
    assert.ok(stored?.orderId);
    assert.equal("trackingToken" in stored.response, false);
    const retry = await placeGuest(app, payload);
    assert.equal(retry.orderNumber, first.orderNumber);
    assert.equal(retry.trackingToken, first.trackingToken);
    assert.equal(retry.trackingToken, issueTrackingToken(trackingSecret, stored.orderId));
    const concurrent = await Promise.all([placeGuest(app, payload), placeGuest(app, payload)]);
    assert.equal(concurrent[0]?.trackingToken, first.trackingToken);
    assert.equal(concurrent[1]?.trackingToken, first.trackingToken);
    const [order] = await db
      .select({ trackingTokenHash: orders.trackingTokenHash })
      .from(orders)
      .where(eq(orders.id, stored.orderId));
    assert.equal(order?.trackingTokenHash, hashTrackingToken(first.trackingToken));
  });

  it("shows admin status updates after refresh and hides cancellation notes", async () => {
    const placed = await placeGuest(app, {
      customerName: "Sita",
      customerPhone: "9876543212",
      deliveryAddress: "Second house",
      items: [{ productId: secondProductId, quantity: 1 }],
      idempotencyKey: key("lifecycle"),
    });
    const orderId = await orderIdByNumber(db, placed.orderNumber);
    await patchStatus(app, adminCookie, orderId, "confirmed");
    await patchStatus(app, adminCookie, orderId, "packed");
    const confirmed = customerOrderStatusResponseSchema.parse((await orderStatus(app, placed.trackingToken)).json());
    assert.equal(confirmed.status, "packed");
    assert.deepEqual(
      confirmed.events.map((event) => event.status),
      ["placed", "confirmed", "packed"],
    );
    const createdAt = confirmed.events.map((event) => Date.parse(event.createdAt));
    assert.ok(createdAt[0] !== undefined && createdAt[1] !== undefined && createdAt[2] !== undefined);
    assert.ok(createdAt[0] <= createdAt[1] && createdAt[1] <= createdAt[2]);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/admin/orders/${orderId}/cancel`,
      headers: { authorization: `Bearer ${adminCookie}` },
      payload: { reason: "internal warehouse shortage" },
    });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    const afterCancel = customerOrderStatusResponseSchema.parse((await orderStatus(app, placed.trackingToken)).json());
    assert.equal(afterCancel.status, "cancelled");
    const last = afterCancel.events.at(-1);
    assert.equal(last?.status, "cancelled");
    assert.equal("note" in (last ?? {}), false);
    assert.equal(JSON.stringify(afterCancel).includes("internal warehouse shortage"), false);
  });

  it("rejects invalid, expired, revoked, and cross-order tokens the same way", async () => {
    const first = await placeGuest(app, {
      customerName: "One",
      customerPhone: "9876543213",
      deliveryAddress: "House A",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("cross-a"),
    });
    const second = await placeGuest(app, {
      customerName: "Two",
      customerPhone: "9876543214",
      deliveryAddress: "House B",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("cross-b"),
    });
    const missingAuth = await orderStatus(app, undefined);
    assert.equal(missingAuth.statusCode, 401);
    assert.equal(errorResponseSchema.parse(missingAuth.json()).error.code, "unauthorized");
    const query = await app.inject({
      method: "GET",
      url: `/api/v1/orders/status?token=${first.trackingToken}`,
    });
    assert.equal(query.statusCode, 401);
    const unknown = await orderStatus(app, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert.equal(unknown.statusCode, 404);
    assert.equal(errorResponseSchema.parse(unknown.json()).error.code, "not_found");
    const cross = await orderStatus(app, first.trackingToken);
    const other = customerOrderStatusResponseSchema.parse(cross.json());
    assert.equal(other.orderNumber, first.orderNumber);
    const stolen = await orderStatus(app, second.trackingToken);
    assert.equal(customerOrderStatusResponseSchema.parse(stolen.json()).orderNumber, second.orderNumber);
    assert.notEqual(first.trackingToken, second.trackingToken);

    const publicLookup = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${first.orderNumber}`,
    });
    assert.equal(publicLookup.statusCode, 404);

    const firstId = await orderIdByNumber(db, first.orderNumber);
    const [beforeRead] = await db
      .select({ trackingTokenExpiresAt: orders.trackingTokenExpiresAt })
      .from(orders)
      .where(eq(orders.id, firstId));
    await orderStatus(app, first.trackingToken);
    const [afterRead] = await db
      .select({ trackingTokenExpiresAt: orders.trackingTokenExpiresAt })
      .from(orders)
      .where(eq(orders.id, firstId));
    assert.deepEqual(afterRead?.trackingTokenExpiresAt, beforeRead?.trackingTokenExpiresAt);

    await db
      .update(orders)
      .set({
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        trackingTokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .where(eq(orders.id, firstId));
    const expired = await orderStatus(app, first.trackingToken);
    assert.equal(expired.statusCode, 404);
    const replayExpired = await placeGuest(app, {
      customerName: "One",
      customerPhone: "9876543213",
      deliveryAddress: "House A",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("cross-a"),
    });
    assert.equal(replayExpired.trackingToken, first.trackingToken);

    const secondId = await orderIdByNumber(db, second.orderNumber);
    await db.update(orders).set({ trackingTokenRevokedAt: new Date() }).where(eq(orders.id, secondId));
    const revoked = await orderStatus(app, second.trackingToken);
    assert.equal(revoked.statusCode, 404);
    const replayRevoked = await placeGuest(app, {
      customerName: "Two",
      customerPhone: "9876543214",
      deliveryAddress: "House B",
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key("cross-b"),
    });
    assert.equal(replayRevoked.trackingToken, second.trackingToken);
  });
});

function key(label: string): string {
  return `trk-${suffix}-${label}`.slice(0, 128);
}

function phoneFrom(value: string, lead: string): string {
  const digits = `${lead}${value.replace(/\D/g, "")}`.padEnd(10, "0").slice(0, 10);
  return `+91${digits}`;
}

async function placeGuest(
  current: Awaited<ReturnType<typeof buildApp>>,
  payload: Record<string, unknown>,
) {
  const response = await current.inject({
    method: "POST",
    url: "/api/v1/checkout/guest",
    payload,
  });
  assert.equal(response.statusCode, 200, response.body);
  return guestCheckoutResponseSchema.parse(response.json());
}

function orderStatus(current: Awaited<ReturnType<typeof buildApp>>, token: string | undefined) {
  return current.inject({
    method: "GET",
    url: "/api/v1/orders/status",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function patchStatus(
  current: Awaited<ReturnType<typeof buildApp>>,
  cookie: string,
  orderId: string,
  status: "confirmed" | "packed" | "out_for_delivery" | "delivered",
) {
  const response = await current.inject({
    method: "PATCH",
    url: `/api/v1/admin/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${cookie}` },
    payload: { status },
  });
  assert.equal(response.statusCode, 200, response.body);
}

async function login(current: Awaited<ReturnType<typeof buildApp>>, email: string, value: string) {
  const response = await current.inject({
    method: "POST",
    url: "/api/v1/admin/session",
    payload: { email, password: value },
  });
  assert.equal(response.statusCode, 200, response.body);
  const header = response.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : header;
  const match = /ghartak_admin_session=([^;]+)/.exec(raw ?? "");
  assert.ok(match?.[1]);
  return match[1];
}

async function orderIdByNumber(database: Database, orderNumber: string): Promise<string> {
  const [order] = await database.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orderNumber));
  if (!order) {
    throw new Error("order missing");
  }
  return order.id;
}

async function insertFixtures(database: Database, fulfilmentId: string) {
  const ids = { categoryId: randomUUID(), productId: randomUUID(), secondProductId: randomUUID() };
  await database.insert(categories).values({
    id: ids.categoryId,
    name: `Trk ${suffix}`,
    slug: `trk-${suffix.toLowerCase()}`,
    isActive: true,
  });
  await database.insert(products).values([
    {
      id: ids.productId,
      categoryId: ids.categoryId,
      name: `Trk One ${suffix}`,
      sku: `${skuPrefix}-ONE`,
      unit: "piece",
      packageSize: 1,
      packageLabel: "1 pc",
      publicationStatus: "published",
      isActive: true,
    },
    {
      id: ids.secondProductId,
      categoryId: ids.categoryId,
      name: `Trk Two ${suffix}`,
      sku: `${skuPrefix}-TWO`,
      unit: "piece",
      packageSize: 1,
      packageLabel: "1 pc",
      publicationStatus: "published",
      isActive: true,
    },
  ]);
  await database.insert(storeProducts).values([
    { storeId: fulfilmentId, productId: ids.productId, pricePaise: 1100, stockQuantity: 20, availability: "available" },
    {
      storeId: fulfilmentId,
      productId: ids.secondProductId,
      pricePaise: 1300,
      stockQuantity: 20,
      availability: "available",
    },
  ]);
  return ids;
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database.select({ id: products.id }).from(products).where(like(products.sku, `${skuPrefix}-%`));
  const productIds = productRows.map((row) => row.id);
  if (productIds.length > 0) {
    const itemRows = await database
      .select({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(inArray(orderItems.productId, productIds));
    const orderIds = [...new Set(itemRows.map((row) => row.orderId))];
    if (orderIds.length > 0) {
      await database.delete(guestCheckoutRequests).where(inArray(guestCheckoutRequests.orderId, orderIds));
      await database.delete(payments).where(inArray(payments.orderId, orderIds));
      await database.delete(orderStatusEvents).where(inArray(orderStatusEvents.orderId, orderIds));
      await database.delete(orderAddresses).where(inArray(orderAddresses.orderId, orderIds));
      await database.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await database.delete(orders).where(inArray(orders.id, orderIds));
    }
    const listings = await database
      .select({ id: storeProducts.id })
      .from(storeProducts)
      .where(inArray(storeProducts.productId, productIds));
    const listingIds = listings.map((listing) => listing.id);
    if (listingIds.length > 0) {
      await database.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listingIds));
      await database.delete(storeProducts).where(inArray(storeProducts.id, listingIds));
    }
    await database.delete(products).where(inArray(products.id, productIds));
  }
  await database.delete(guestCheckoutRequests).where(like(guestCheckoutRequests.idempotencyKey, `trk-${suffix}%`));
  await database.delete(categories).where(like(categories.slug, `trk-${suffix.toLowerCase()}`));
  const people = await database
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%${suffix.toLowerCase()}@example.com`));
  const userIds = people.map((person) => person.id);
  if (userIds.length > 0) {
    await database.delete(adminSessions).where(inArray(adminSessions.userId, userIds));
    await database.delete(userRoles).where(inArray(userRoles.userId, userIds));
    await database.delete(users).where(inArray(users.id, userIds));
  }
}
