import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  adminDeliveryChargeSchema,
  errorResponseSchema,
  guestCheckoutResponseSchema,
} from "@ghartak/contracts";
import {
  adminSessions,
  appSettings,
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
import { logRedactPaths } from "../src/logger.js";
import { hashTrackingToken } from "../src/modules/orders/tracking-token.js";
import { createLogger } from "../src/logger.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const password = "correct-horse-battery";
const adminEmail = `chk-admin-${suffix.toLowerCase()}@example.com`;

type Fixture = {
  categoryId: string;
  inactiveCategoryId: string;
  pricedId: string;
  pricedTwoId: string;
  stockOneId: string;
  draftId: string;
  inactiveId: string;
  inactiveCategoryProductId: string;
  unavailableId: string;
  emptyId: string;
  rollbackOkId: string;
  rollbackFailId: string;
};

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let fixture: Fixture;
let storeId = "";
let originalFee = 0;

describe("guest checkout", () => {
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
    const [fee] = await db
      .select({ valuePaise: appSettings.valuePaise })
      .from(appSettings)
      .where(eq(appSettings.key, "delivery_fee"));
    originalFee = fee?.valuePaise ?? 0;
    fixture = await insertFixtures(db, storeId);
    await createAdministrator(db, {
      name: "Checkout Admin",
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
        rateLimitPrefix: `chk-admin:${suffix}`,
        trustedOrigins: [],
      },
      checkout: {
        checkoutLimit: 200,
        checkoutWindowSeconds: 600,
        checkoutRatePrefix: `chk-guest:${suffix}`,
      },
    });
    token = await login(app, adminEmail, password);
  });

  after(async () => {
    await db
      .update(appSettings)
      .set({ valuePaise: originalFee, updatedByUserId: null })
      .where(eq(appSettings.key, "delivery_fee"));
    await cleanup(db);
    await redis.quit();
    await app.close();
    await closeDatabase();
  });

  it("places a valid guest COD order from current prices", async () => {
    await db.update(storeProducts).set({ pricePaise: 1700 }).where(eq(storeProducts.productId, fixture.pricedId));
    const body = await checkout(app, {
      customerName: "Ramu",
      customerPhone: "9876543210",
      deliveryAddress: "House near the school",
      items: [{ productId: fixture.pricedId, quantity: 2 }],
      idempotencyKey: key("valid"),
      unitPricePaise: 1,
    }).then((response) => {
      assert.equal(response.statusCode, 400, response.body);
      return checkout(app, {
        customerName: "Ramu",
        customerPhone: "9876543210",
        deliveryAddress: "House near the school",
        items: [{ productId: fixture.pricedId, quantity: 2 }],
        idempotencyKey: key("valid"),
      });
    });
    assert.equal(body.statusCode, 200, body.body);
    const order = guestCheckoutResponseSchema.parse(body.json());
    assert.equal(order.paymentMethod, "cash_on_delivery");
    assert.equal(order.paymentStatus, "pending");
    assert.equal(order.status, "placed");
    assert.equal(order.customerName, "Ramu");
    assert.equal(order.items[0]?.unitPricePaise, 1700);
    assert.equal(order.items[0]?.lineTotalPaise, 3400);
    assert.equal(order.subtotalPaise, 3400);
    assert.equal(order.deliveryFeePaise, originalFee);
    assert.equal(order.totalPaise, 3400 + originalFee);
    assert.equal("customerPhone" in order, false);
    assert.equal("deliveryAddress" in order, false);
    assert.equal("id" in order, false);
    assert.match(order.trackingToken, /^[A-Za-z0-9_-]{43}$/);
    const [tracking] = await db
      .select({
        trackingTokenHash: orders.trackingTokenHash,
        trackingTokenExpiresAt: orders.trackingTokenExpiresAt,
        trackingTokenRevokedAt: orders.trackingTokenRevokedAt,
      })
      .from(orders)
      .where(eq(orders.orderNumber, order.orderNumber));
    assert.equal(tracking?.trackingTokenHash, hashTrackingToken(order.trackingToken));
    assert.notEqual(tracking?.trackingTokenHash, order.trackingToken);
    assert.ok(tracking?.trackingTokenExpiresAt);
    assert.equal(tracking?.trackingTokenRevokedAt, null);
    const [stored] = await db
      .select({ response: guestCheckoutRequests.response })
      .from(guestCheckoutRequests)
      .where(eq(guestCheckoutRequests.idempotencyKey, key("valid")));
    assert.equal("trackingToken" in (stored?.response ?? {}), false);
    const [listing] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, fixture.pricedId));
    assert.equal(listing?.stockQuantity, 8);
    const [movement] = await db
      .select({
        quantityDelta: inventoryMovements.quantityDelta,
        stockAfter: inventoryMovements.stockAfter,
        actorUserId: inventoryMovements.actorUserId,
        reason: inventoryMovements.reason,
      })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, fixture.pricedId));
    assert.equal(movement?.quantityDelta, -2);
    assert.equal(movement?.stockAfter, 8);
    assert.equal(movement?.actorUserId, null);
    assert.equal(movement?.reason, `guest_order:${order.orderNumber}`);
    const missing = await app.inject({ method: "GET", url: `/api/v1/orders/${order.orderNumber}` });
    assert.equal(missing.statusCode, 404);
  });

  it("rejects missing customer name, invalid mobile, missing address, empty cart, invalid uuid, and invalid quantity", async () => {
    const cases = [
      { customerName: "  ", customerPhone: "9876543210", deliveryAddress: "House", items: [{ productId: fixture.pricedTwoId, quantity: 1 }], idempotencyKey: key("name") },
      { customerName: "Ramu", customerPhone: "12345", deliveryAddress: "House", items: [{ productId: fixture.pricedTwoId, quantity: 1 }], idempotencyKey: key("phone") },
      { customerName: "Ramu", customerPhone: "9876543210", deliveryAddress: "   ", items: [{ productId: fixture.pricedTwoId, quantity: 1 }], idempotencyKey: key("addr") },
      { customerName: "Ramu", customerPhone: "9876543210", deliveryAddress: "House", items: [], idempotencyKey: key("empty") },
      { customerName: "Ramu", customerPhone: "9876543210", deliveryAddress: "House", items: [{ productId: "not-a-uuid", quantity: 1 }], idempotencyKey: key("uuid") },
      { customerName: "Ramu", customerPhone: "9876543210", deliveryAddress: "House", items: [{ productId: fixture.pricedTwoId, quantity: 0 }], idempotencyKey: key("qty") },
    ];
    for (const payload of cases) {
      const response = await checkout(app, payload);
      assert.equal(response.statusCode, 400, `${JSON.stringify(payload)} ${response.body}`);
    }
    const [listing] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, fixture.pricedTwoId));
    assert.equal(listing?.stockQuantity, 10);
  });

  it("merges duplicate product ids before processing", async () => {
    const response = await checkout(app, {
      customerName: "Sita",
      customerPhone: "+91 98765 43211",
      deliveryAddress: "Near the well",
      items: [
        { productId: fixture.pricedTwoId, quantity: 2 },
        { productId: fixture.pricedTwoId, quantity: 3 },
      ],
      idempotencyKey: key("dup"),
    });
    assert.equal(response.statusCode, 200, response.body);
    const order = guestCheckoutResponseSchema.parse(response.json());
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0]?.quantity, 5);
    assert.equal(order.items[0]?.unitPricePaise, 2000);
    assert.equal(order.items[0]?.lineTotalPaise, 10000);
    assert.equal(order.subtotalPaise, 10000);
  });

  it("applies an admin delivery charge and keeps historical totals", async () => {
    const denied = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/delivery-charge",
      payload: { deliveryFeePaise: 2500 },
    });
    assert.equal(denied.statusCode, 401);
    const customer = await insertCustomer(db);
    const customerDenied = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/delivery-charge",
      headers: { authorization: `Bearer ${customer.id}` },
      payload: { deliveryFeePaise: 2500 },
    });
    assert.equal(customerDenied.statusCode, 401);
    const updated = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/delivery-charge",
      headers: { authorization: `Bearer ${token}` },
      payload: { deliveryFeePaise: 2500 },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(adminDeliveryChargeSchema.parse(updated.json()).deliveryFeePaise, 2500);
    const placed = await checkout(app, {
      customerName: "Lakshmi",
      customerPhone: "9876543212",
      deliveryAddress: "Main road",
      items: [{ productId: fixture.pricedId, quantity: 1 }],
      idempotencyKey: key("fee"),
    });
    assert.equal(placed.statusCode, 200, placed.body);
    const order = guestCheckoutResponseSchema.parse(placed.json());
    assert.equal(order.deliveryFeePaise, 2500);
    assert.equal(order.subtotalPaise, 1700);
    assert.equal(order.totalPaise, 4200);
    const reset = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/delivery-charge",
      headers: { authorization: `Bearer ${token}` },
      payload: { deliveryFeePaise: 0 },
    });
    assert.equal(reset.statusCode, 200, reset.body);
    const [saved] = await db
      .select({ deliveryFeePaise: orders.deliveryFeePaise, totalPaise: orders.totalPaise })
      .from(orders)
      .where(eq(orders.orderNumber, order.orderNumber));
    assert.equal(saved?.deliveryFeePaise, 2500);
    assert.equal(saved?.totalPaise, 4200);
    const current = await app.inject({
      method: "GET",
      url: "/api/v1/admin/settings/delivery-charge",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(adminDeliveryChargeSchema.parse(current.json()).deliveryFeePaise, 0);
  });

  it("rejects unpublished, inactive, inactive-category, unavailable, empty, and oversold products", async () => {
    const cases = [
      fixture.draftId,
      fixture.inactiveId,
      fixture.inactiveCategoryProductId,
      fixture.unavailableId,
      fixture.emptyId,
    ];
    for (const productId of cases) {
      const response = await checkout(app, {
        customerName: "Ramu",
        customerPhone: "9876543213",
        deliveryAddress: "House",
        items: [{ productId, quantity: 1 }],
        idempotencyKey: key(`bad-${productId.slice(0, 8)}`),
      });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(errorResponseSchema.parse(response.json()).error.productId, productId);
    }
    const tooMany = await checkout(app, {
      customerName: "Ramu",
      customerPhone: "9876543213",
      deliveryAddress: "House",
      items: [{ productId: fixture.stockOneId, quantity: 2 }],
      idempotencyKey: key("oversell"),
    });
    assert.equal(tooMany.statusCode, 409, tooMany.body);
    assert.equal(errorResponseSchema.parse(tooMany.json()).error.code, "insufficient_stock");
  });

  it("rolls back a multi-product order when one item cannot be sold", async () => {
    const before = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, fixture.rollbackOkId));
    const response = await checkout(app, {
      customerName: "Ramu",
      customerPhone: "9876543214",
      deliveryAddress: "House",
      items: [
        { productId: fixture.rollbackOkId, quantity: 1 },
        { productId: fixture.rollbackFailId, quantity: 1 },
      ],
      idempotencyKey: key("rollback"),
    });
    assert.equal(response.statusCode, 409, response.body);
    const after = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, fixture.rollbackOkId));
    assert.equal(after[0]?.stockQuantity, before[0]?.stockQuantity);
    const movements = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, fixture.rollbackOkId));
    assert.equal(movements.length, 0);
  });

  it("lets only one concurrent order take the last unit", async () => {
    const first = checkout(app, {
      customerName: "One",
      customerPhone: "9876543215",
      deliveryAddress: "House A",
      items: [{ productId: fixture.stockOneId, quantity: 1 }],
      idempotencyKey: key("race-a"),
    });
    const second = checkout(app, {
      customerName: "Two",
      customerPhone: "9876543216",
      deliveryAddress: "House B",
      items: [{ productId: fixture.stockOneId, quantity: 1 }],
      idempotencyKey: key("race-b"),
    });
    const results = await Promise.all([first, second]);
    const codes = results.map((result) => result.statusCode).sort();
    assert.deepEqual(codes, [200, 409]);
    const [listing] = await db
      .select({ stockQuantity: storeProducts.stockQuantity, availability: storeProducts.availability })
      .from(storeProducts)
      .where(eq(storeProducts.productId, fixture.stockOneId));
    assert.equal(listing?.stockQuantity, 0);
    assert.equal(listing?.availability, "out_of_stock");
  });

  it("replays a successful idempotent request and rejects a reused key with a different body", async () => {
    const payload = {
      customerName: "Replay",
      customerPhone: "9876543217",
      deliveryAddress: "Replay house",
      items: [{ productId: fixture.pricedId, quantity: 1 }],
      idempotencyKey: key("replay"),
    };
    const first = await checkout(app, payload);
    assert.equal(first.statusCode, 200, first.body);
    const original = guestCheckoutResponseSchema.parse(first.json());
    const retry = await checkout(app, payload);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.deepEqual(retry.json(), first.json());
    assert.equal(guestCheckoutResponseSchema.parse(retry.json()).trackingToken, original.trackingToken);
    const concurrent = await Promise.all([checkout(app, payload), checkout(app, payload)]);
    assert.equal(concurrent[0]?.statusCode, 200);
    assert.equal(concurrent[1]?.statusCode, 200);
    assert.equal(guestCheckoutResponseSchema.parse(concurrent[0].json()).orderNumber, original.orderNumber);
    assert.equal(guestCheckoutResponseSchema.parse(concurrent[0].json()).trackingToken, original.trackingToken);
    assert.equal(guestCheckoutResponseSchema.parse(concurrent[1].json()).trackingToken, original.trackingToken);
    const conflict = await checkout(app, { ...payload, customerName: "Different" });
    assert.equal(conflict.statusCode, 409, conflict.body);
    assert.equal(errorResponseSchema.parse(conflict.json()).error.code, "idempotency_conflict");
    const [count] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.orderNumber, original.orderNumber));
    assert.ok(count);
  });

  it("does not log phone numbers, addresses, or idempotency keys in the redact list", () => {
    assert.ok(logRedactPaths.includes("req.body.customerPhone"));
    assert.ok(logRedactPaths.includes("req.body.deliveryAddress"));
    assert.ok(logRedactPaths.includes("req.body.idempotencyKey"));
    assert.ok(logRedactPaths.includes("*.phone"));
    assert.ok(logRedactPaths.includes("*.trackingToken"));
    assert.ok(logRedactPaths.includes("ORDER_TRACKING_SECRET"));
  });
});

function key(label: string): string {
  return `chk-${suffix}-${label}`.slice(0, 128);
}

function checkout(
  current: Awaited<ReturnType<typeof buildApp>>,
  payload: Record<string, unknown>,
) {
  return current.inject({
    method: "POST",
    url: "/api/v1/checkout/guest",
    payload,
  });
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

function phoneFrom(value: string, lead: string): string {
  const digits = `${lead}${value.replace(/\D/g, "")}`.padEnd(10, "0").slice(0, 10);
  return `+91${digits}`;
}

async function insertCustomer(database: Database) {
  const [user] = await database
    .insert(users)
    .values({
      name: "Checkout Customer",
      phone: phoneFrom(`${suffix}c`, "7"),
      email: `chk-cust-${suffix.toLowerCase()}@example.com`,
      status: "active",
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("customer fixture missing");
  }
  await database.insert(userRoles).values({ userId: user.id, role: "customer" });
  return user;
}

async function insertFixtures(database: Database, fulfilmentId: string): Promise<Fixture> {
  const ids: Fixture = {
    categoryId: randomUUID(),
    inactiveCategoryId: randomUUID(),
    pricedId: randomUUID(),
    pricedTwoId: randomUUID(),
    stockOneId: randomUUID(),
    draftId: randomUUID(),
    inactiveId: randomUUID(),
    inactiveCategoryProductId: randomUUID(),
    unavailableId: randomUUID(),
    emptyId: randomUUID(),
    rollbackOkId: randomUUID(),
    rollbackFailId: randomUUID(),
  };
  await database.insert(categories).values([
    { id: ids.categoryId, name: `Chk Active ${suffix}`, slug: `chk-active-${suffix.toLowerCase()}`, isActive: true },
    {
      id: ids.inactiveCategoryId,
      name: `Chk Inactive ${suffix}`,
      slug: `chk-inactive-${suffix.toLowerCase()}`,
      isActive: false,
    },
  ]);
  await database.insert(products).values([
    product(ids.pricedId, ids.categoryId, `Chk Price ${suffix}`, "published", true),
    product(ids.pricedTwoId, ids.categoryId, `Chk Price Two ${suffix}`, "published", true),
    product(ids.stockOneId, ids.categoryId, `Chk One ${suffix}`, "published", true),
    product(ids.draftId, ids.categoryId, `Chk Draft ${suffix}`, "draft", true),
    product(ids.inactiveId, ids.categoryId, `Chk Off ${suffix}`, "published", false),
    product(
      ids.inactiveCategoryProductId,
      ids.inactiveCategoryId,
      `Chk Hidden ${suffix}`,
      "published",
      true,
    ),
    product(ids.unavailableId, ids.categoryId, `Chk Unav ${suffix}`, "published", true),
    product(ids.emptyId, ids.categoryId, `Chk Empty ${suffix}`, "published", true),
    product(ids.rollbackOkId, ids.categoryId, `Chk Ok ${suffix}`, "published", true),
    product(ids.rollbackFailId, ids.categoryId, `Chk Fail ${suffix}`, "published", true),
  ]);
  await database.insert(storeProducts).values([
    listing(ids.pricedId, fulfilmentId, 1500, 10, "available"),
    listing(ids.pricedTwoId, fulfilmentId, 2000, 10, "available"),
    listing(ids.stockOneId, fulfilmentId, 900, 1, "available"),
    listing(ids.draftId, fulfilmentId, 900, 4, "available"),
    listing(ids.inactiveId, fulfilmentId, 900, 4, "available"),
    listing(ids.inactiveCategoryProductId, fulfilmentId, 900, 4, "available"),
    listing(ids.unavailableId, fulfilmentId, 900, 4, "unavailable"),
    listing(ids.emptyId, fulfilmentId, 900, 0, "out_of_stock"),
    listing(ids.rollbackOkId, fulfilmentId, 1100, 6, "available"),
    listing(ids.rollbackFailId, fulfilmentId, 1100, 0, "out_of_stock"),
  ]);
  return ids;
}

function product(
  id: string,
  categoryId: string,
  name: string,
  publicationStatus: "draft" | "published" | "archived",
  isActive: boolean,
) {
  return {
    id,
    categoryId,
    name,
    unit: "piece" as const,
    packageSize: 1,
    packageLabel: "1 pc",
    publicationStatus,
    isActive,
  };
}

function listing(
  productId: string,
  fulfilmentId: string,
  pricePaise: number,
  stockQuantity: number,
  availability: "available" | "unavailable" | "out_of_stock",
) {
  return { storeId: fulfilmentId, productId, pricePaise, stockQuantity, availability };
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database
    .select({ id: products.id })
    .from(products)
    .where(like(products.name, `Chk % ${suffix}`));
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
    const listingIds = listings.map((row) => row.id);
    if (listingIds.length > 0) {
      await database.delete(inventoryMovements).where(inArray(inventoryMovements.storeProductId, listingIds));
      await database.delete(storeProducts).where(inArray(storeProducts.id, listingIds));
    }
    await database.delete(products).where(inArray(products.id, productIds));
  }
  await database.delete(guestCheckoutRequests).where(like(guestCheckoutRequests.idempotencyKey, `chk-${suffix}%`));
  await database.delete(categories).where(like(categories.slug, `chk-%${suffix.toLowerCase()}%`));
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
