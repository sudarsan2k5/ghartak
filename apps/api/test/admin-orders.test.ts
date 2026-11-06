import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  adminOrderDetailSchema,
  adminOrderListResponseSchema,
  adminOrderSummarySchema,
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
  withTransaction,
  type Database,
} from "@ghartak/database";
import { eq, inArray, like } from "drizzle-orm";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";
import { createAdministrator } from "../src/modules/admin/auth/accounts.js";
import { createAdminOrderService } from "../src/modules/admin/orders/order.service.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const skuPrefix = `ORD-${suffix}`;
const password = "correct-horse-battery";
const adminEmail = `ord-admin-${suffix.toLowerCase()}@example.com`;

let db: Database;
let redis: Redis;
let app: Awaited<ReturnType<typeof buildApp>>;
let token = "";
let adminId = "";
let storeId = "";
let productId = "";
let secondProductId = "";
let customerId = "";
let guestOrderId = "";
let guestOrderNumber = "";
let registeredOrderId = "";
let registeredOrderNumber = "";

describe("admin order management", () => {
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
    const fixtures = await insertCatalogue(db, storeId);
    productId = fixtures.productId;
    secondProductId = fixtures.secondProductId;
    const admin = await createAdministrator(db, {
      name: "Order Admin",
      email: adminEmail,
      phone: phoneFrom(suffix, "6"),
      password,
    });
    adminId = admin.id;
    customerId = await insertCustomer(db);
    app = await buildApp({
      logger: createLogger("silent"),
      db,
      redis,
      auth: {
        sessionTtlSeconds: 60 * 60,
        secureCookies: false,
        loginLimit: 30,
        loginWindowSeconds: 900,
        rateLimitPrefix: `ord-admin:${suffix}`,
        trustedOrigins: [],
      },
      checkout: {
        checkoutLimit: 200,
        checkoutWindowSeconds: 600,
        checkoutRatePrefix: `ord-guest:${suffix}`,
      },
    });
    token = await login(app, adminEmail, password);
    const guest = await placeGuest(app, {
      customerName: "Guest Ramu",
      customerPhone: "9876500001",
      deliveryAddress: "Guest house near the school",
      items: [{ productId, quantity: 2 }],
      idempotencyKey: `ord-${suffix}-guest`,
    });
    guestOrderNumber = guest.orderNumber;
    guestOrderId = await orderIdByNumber(db, guest.orderNumber);
    const registered = await insertRegisteredOrder(db, {
      userId: customerId,
      storeId,
      productId,
      quantity: 1,
      unitPricePaise: 1500,
      customerName: "Registered Sita",
      customerPhone: "+919876500002",
      line1: "12 Market Road",
      locality: "Demo Village",
      city: "Demo Village",
      state: "Uttar Pradesh",
      postalCode: "226001",
    });
    registeredOrderId = registered.id;
    registeredOrderNumber = registered.orderNumber;
  });

  after(async () => {
    await cleanup(db);
    await redis.quit();
    await app.close();
    await closeDatabase();
  });

  it("rejects unauthenticated and non-admin access", async () => {
    const urls = [
      "/api/v1/admin/orders",
      "/api/v1/admin/orders/summary",
      `/api/v1/admin/orders/${guestOrderId}`,
    ];
    for (const url of urls) {
      const missing = await app.inject({ method: "GET", url });
      assert.equal(missing.statusCode, 401, url);
    }
    const customerDenied = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders",
      headers: { authorization: `Bearer ${customerId}` },
    });
    assert.equal(customerDenied.statusCode, 401);
  });

  it("lists guest and registered orders without a guest-only default", async () => {
    const body = adminOrderListResponseSchema.parse(await getJson(app, token, "/api/v1/admin/orders?limit=100"));
    const numbers = body.orders.map((order) => order.orderNumber);
    assert.ok(numbers.includes(guestOrderNumber));
    assert.ok(numbers.includes(registeredOrderNumber));
    const guest = body.orders.find((order) => order.orderNumber === guestOrderNumber);
    const registered = body.orders.find((order) => order.orderNumber === registeredOrderNumber);
    assert.equal(guest?.customerType, "guest");
    assert.equal(guest?.customerName, "Guest Ramu");
    assert.equal(guest?.customerPhone, "+919876500001");
    assert.equal(guest?.itemCount, 1);
    assert.equal(guest?.subtotalPaise, 3000);
    assert.equal(registered?.customerType, "registered");
    assert.equal(registered?.customerName, "Registered Sita");
    const guests = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?customerType=guest&limit=100"),
    );
    assert.equal(guests.orders.every((order) => order.customerType === "guest"), true);
    assert.ok(guests.orders.some((order) => order.orderNumber === guestOrderNumber));
    assert.equal(guests.orders.some((order) => order.orderNumber === registeredOrderNumber), false);
    const registeredOnly = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?customerType=registered&limit=100"),
    );
    assert.equal(registeredOnly.orders.every((order) => order.customerType === "registered"), true);
    assert.ok(registeredOnly.orders.some((order) => order.orderNumber === registeredOrderNumber));
  });

  it("paginates newest first and filters by status, payment, name, phone, and order number", async () => {
    const page1 = adminOrderListResponseSchema.parse(await getJson(app, token, "/api/v1/admin/orders?limit=1&page=1"));
    const page2 = adminOrderListResponseSchema.parse(await getJson(app, token, "/api/v1/admin/orders?limit=1&page=2"));
    assert.equal(page1.orders.length, 1);
    assert.equal(page2.orders.length, 1);
    assert.notEqual(page1.orders[0]?.id, page2.orders[0]?.id);
    assert.ok(page1.pagination.total >= 2);
    assert.ok(new Date(page1.orders[0]?.createdAt ?? 0) >= new Date(page2.orders[0]?.createdAt ?? 0));
    const placed = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?status=placed&limit=100"),
    );
    assert.ok(placed.orders.some((order) => order.orderNumber === guestOrderNumber));
    const pending = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?paymentStatus=pending&paymentMethod=cash_on_delivery&limit=100"),
    );
    assert.ok(pending.orders.some((order) => order.orderNumber === guestOrderNumber));
    const byNumber = adminOrderListResponseSchema.parse(
      await getJson(app, token, `/api/v1/admin/orders?orderNumber=${guestOrderNumber}`),
    );
    assert.equal(byNumber.orders.length, 1);
    assert.equal(byNumber.orders[0]?.orderNumber, guestOrderNumber);
    const byName = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?customerName=Guest%20Ramu"),
    );
    assert.ok(byName.orders.some((order) => order.orderNumber === guestOrderNumber));
    const byPhone = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?customerPhone=9876500001"),
    );
    assert.ok(byPhone.orders.some((order) => order.orderNumber === guestOrderNumber));
    const future = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?createdFrom=2099-01-01T00:00:00.000Z"),
    );
    assert.equal(future.orders.length, 0);
    assert.equal(future.pagination.total, 0);
  });

  it("returns historical snapshots for both customer types and 404 for unknown ids", async () => {
    const guest = adminOrderDetailSchema.parse(await getJson(app, token, `/api/v1/admin/orders/${guestOrderId}`));
    assert.equal(guest.customerType, "guest");
    assert.equal(guest.userId, null);
    assert.equal(guest.address.line1, "Guest house near the school");
    assert.equal(guest.items[0]?.unitPricePaise, 1500);
    assert.equal(guest.paymentStatus, "pending");
    assert.equal(guest.payment?.status, "pending");
    assert.equal("idempotencyKey" in (guest.payment ?? {}), false);
    assert.equal(guest.statusHistory[0]?.toStatus, "placed");
    const registered = adminOrderDetailSchema.parse(
      await getJson(app, token, `/api/v1/admin/orders/${registeredOrderId}`),
    );
    assert.equal(registered.customerType, "registered");
    assert.equal(registered.userId, customerId);
    assert.equal(registered.address.line1, "12 Market Road");
    assert.equal(registered.address.postalCode, "226001");
    await db.update(users).set({ name: "Changed Profile" }).where(eq(users.id, customerId));
    const after = adminOrderDetailSchema.parse(await getJson(app, token, `/api/v1/admin/orders/${registeredOrderId}`));
    assert.equal(after.customerName, "Registered Sita");
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders/10000000-0000-4000-8000-000000009999",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(missing.statusCode, 404);
    const publicLookup = await app.inject({ method: "GET", url: `/api/v1/orders/${guestOrderNumber}` });
    assert.equal(publicLookup.statusCode, 404);
  });

  it("advances status on valid transitions, records the admin, and leaves COD unpaid", async () => {
    const confirmed = await patchStatus(app, token, guestOrderId, "confirmed");
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const body = adminOrderDetailSchema.parse(confirmed.json());
    assert.equal(body.status, "confirmed");
    assert.equal(body.paymentStatus, "pending");
    assert.equal(body.payment?.status, "pending");
    const event = body.statusHistory.find((entry) => entry.toStatus === "confirmed");
    assert.equal(event?.actor?.id, adminId);
    assert.equal(event?.fromStatus, "placed");
    const skipped = await patchStatus(app, token, guestOrderId, "delivered");
    assert.equal(skipped.statusCode, 409);
    assert.equal(errorResponseSchema.parse(skipped.json()).error.code, "invalid_status_transition");
    const cancelledOnStatus = await patchStatus(app, token, guestOrderId, "cancelled");
    assert.equal(cancelledOnStatus.statusCode, 400);
    for (const status of ["packed", "out_for_delivery", "delivered"] as const) {
      const response = await patchStatus(app, token, guestOrderId, status);
      assert.equal(response.statusCode, 200, response.body);
    }
    const delivered = adminOrderDetailSchema.parse(
      await getJson(app, token, `/api/v1/admin/orders/${guestOrderId}`),
    );
    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.paymentStatus, "pending");
    const terminal = await patchStatus(app, token, guestOrderId, "confirmed");
    assert.equal(terminal.statusCode, 409);
  });

  it("rejects concurrent status updates that would overwrite one another", async () => {
    const extra = await placeGuest(app, {
      customerName: "Race Guest",
      customerPhone: "9876500003",
      deliveryAddress: "Race house",
      items: [{ productId: secondProductId, quantity: 1 }],
      idempotencyKey: `ord-${suffix}-race-status`,
    });
    const orderId = await orderIdByNumber(db, extra.orderNumber);
    const results = await Promise.all([
      patchStatus(app, token, orderId, "confirmed"),
      patchStatus(app, token, orderId, "confirmed"),
    ]);
    const codes = results.map((result) => result.statusCode).sort();
    assert.deepEqual(codes, [200, 409]);
    const detail = adminOrderDetailSchema.parse(await getJson(app, token, `/api/v1/admin/orders/${orderId}`));
    assert.equal(detail.status, "confirmed");
    assert.equal(detail.statusHistory.filter((event) => event.toStatus === "confirmed").length, 1);
  });

  it("cancels an order, restores snapshot quantities, and refuses a second restock", async () => {
    const placed = await placeGuest(app, {
      customerName: "Cancel Guest",
      customerPhone: "9876500004",
      deliveryAddress: "Cancel house",
      items: [{ productId: secondProductId, quantity: 2 }],
      idempotencyKey: `ord-${suffix}-cancel`,
    });
    const orderId = await orderIdByNumber(db, placed.orderNumber);
    const [before] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, secondProductId));
    const cancelled = await cancelOrder(app, token, orderId, "Customer asked to stop");
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    const detail = adminOrderDetailSchema.parse(cancelled.json());
    assert.equal(detail.status, "cancelled");
    assert.equal(detail.paymentStatus, "pending");
    const cancelEvent = detail.statusHistory.find((event) => event.toStatus === "cancelled");
    assert.equal(cancelEvent?.note, "Customer asked to stop");
    assert.equal(cancelEvent?.actor?.id, adminId);
    const [after] = await db
      .select({ stockQuantity: storeProducts.stockQuantity, availability: storeProducts.availability })
      .from(storeProducts)
      .where(eq(storeProducts.productId, secondProductId));
    assert.equal(after?.stockQuantity, (before?.stockQuantity ?? 0) + 2);
    const additions = await db
      .select({ quantityDelta: inventoryMovements.quantityDelta, reason: inventoryMovements.reason, actorUserId: inventoryMovements.actorUserId })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, secondProductId));
    const cancelMovement = additions.find((row) => row.reason === `order_cancel:${placed.orderNumber}`);
    assert.equal(cancelMovement?.quantityDelta, 2);
    assert.equal(cancelMovement?.actorUserId, adminId);
    const again = await cancelOrder(app, token, orderId, "Try again");
    assert.equal(again.statusCode, 409);
    assert.equal(errorResponseSchema.parse(again.json()).error.code, "already_cancelled");
    const [unchanged] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, secondProductId));
    assert.equal(unchanged?.stockQuantity, after?.stockQuantity);
    const deliveredDenied = await cancelOrder(app, token, guestOrderId, "Too late");
    assert.equal(deliveredDenied.statusCode, 409);
    assert.equal(errorResponseSchema.parse(deliveredDenied.json()).error.code, "cannot_cancel_delivered");
  });

  it("cancels a registered order and does not double-restock concurrent cancels", async () => {
    const created = await insertRegisteredOrder(db, {
      userId: customerId,
      storeId,
      productId,
      quantity: 1,
      unitPricePaise: 1500,
      customerName: "Registered Sita",
      customerPhone: "+919876500002",
      line1: "12 Market Road",
    });
    const [before] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, productId));
    const results = await Promise.all([
      cancelOrder(app, token, created.id, "First cancel"),
      cancelOrder(app, token, created.id, "Second cancel"),
    ]);
    const codes = results.map((result) => result.statusCode).sort();
    assert.deepEqual(codes, [200, 409]);
    const [after] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, productId));
    assert.equal(after?.stockQuantity, (before?.stockQuantity ?? 0) + 1);
    const cancelMovements = await db
      .select({ reason: inventoryMovements.reason })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, productId));
    assert.equal(cancelMovements.filter((row) => row.reason === `order_cancel:${created.orderNumber}`).length, 1);
  });

  it("summarises guest and registered orders without counting cancelled COD as collected or awaiting", async () => {
    const summary = adminOrderSummarySchema.parse(await getJson(app, token, "/api/v1/admin/orders/summary"));
    assert.ok(summary.totalOrders >= 2);
    assert.ok(summary.guestOrders >= 1);
    assert.ok(summary.registeredOrders >= 1);
    assert.ok(summary.delivered >= 1);
    assert.ok(summary.cancelled >= 1);
    const openCod = adminOrderListResponseSchema.parse(
      await getJson(app, token, "/api/v1/admin/orders?paymentMethod=cash_on_delivery&limit=100"),
    );
    const awaiting = openCod.orders.filter(
      (order) => order.paymentStatus === "pending" && order.status !== "cancelled",
    );
    const expectedAmount = awaiting.reduce((sum, order) => sum + order.totalPaise, 0);
    assert.equal(summary.codAwaitingPaymentCount, awaiting.length);
    assert.equal(summary.codAwaitingCollectionPaise, expectedAmount);
    assert.equal(summary.codAwaitingCollectionPaise >= 0, true);
  });

  it("rolls back stock, movements, and status if cancellation fails after restock", async () => {
    const placed = await placeGuest(app, {
      customerName: "Rollback Guest",
      customerPhone: "9876500005",
      deliveryAddress: "Rollback house",
      items: [{ productId: secondProductId, quantity: 1 }],
      idempotencyKey: `ord-${suffix}-cancel-rollback`,
    });
    const orderId = await orderIdByNumber(db, placed.orderNumber);
    const [beforeStock] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, secondProductId));
    const eventsBefore = await db
      .select({ id: orderStatusEvents.id })
      .from(orderStatusEvents)
      .where(eq(orderStatusEvents.orderId, orderId));
    const movementsBefore = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, secondProductId));
    await assert.rejects(
      () =>
        createAdminOrderService(db).cancel(orderId, { reason: "Injected failure" }, adminId, {
          afterStockRestore: async () => {
            throw new Error("injected failure after stock restore");
          },
        }),
      (error: unknown) => error instanceof Error && error.message === "injected failure after stock restore",
    );
    const [afterStock] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.productId, secondProductId));
    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    const eventsAfter = await db
      .select({ id: orderStatusEvents.id, toStatus: orderStatusEvents.toStatus })
      .from(orderStatusEvents)
      .where(eq(orderStatusEvents.orderId, orderId));
    const movementsAfter = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .innerJoin(storeProducts, eq(storeProducts.id, inventoryMovements.storeProductId))
      .where(eq(storeProducts.productId, secondProductId));
    assert.equal(afterStock?.stockQuantity, beforeStock?.stockQuantity);
    assert.equal(order?.status, "placed");
    assert.equal(eventsAfter.length, eventsBefore.length);
    assert.equal(eventsAfter.some((event) => event.toStatus === "cancelled"), false);
    assert.equal(movementsAfter.length, movementsBefore.length);
  });
});

async function getJson(current: Awaited<ReturnType<typeof buildApp>>, bearer: string, url: string) {
  const response = await current.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${bearer}` },
  });
  assert.equal(response.statusCode, 200, `${url} ${response.body}`);
  return response.json();
}

function patchStatus(
  current: Awaited<ReturnType<typeof buildApp>>,
  bearer: string,
  orderId: string,
  status: string,
) {
  return current.inject({
    method: "PATCH",
    url: `/api/v1/admin/orders/${orderId}/status`,
    headers: { authorization: `Bearer ${bearer}` },
    payload: { status },
  });
}

function cancelOrder(
  current: Awaited<ReturnType<typeof buildApp>>,
  bearer: string,
  orderId: string,
  reason: string,
) {
  return current.inject({
    method: "POST",
    url: `/api/v1/admin/orders/${orderId}/cancel`,
    headers: { authorization: `Bearer ${bearer}` },
    payload: { reason },
  });
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

async function orderIdByNumber(database: Database, orderNumber: string) {
  const [row] = await database.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, orderNumber));
  if (!row) {
    throw new Error("order number missing");
  }
  return row.id;
}

async function insertCustomer(database: Database) {
  const [user] = await database
    .insert(users)
    .values({
      name: "Registered Sita",
      phone: phoneFrom(`${suffix}c`, "7"),
      email: `ord-cust-${suffix.toLowerCase()}@example.com`,
      status: "active",
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("customer fixture missing");
  }
  await database.insert(userRoles).values({ userId: user.id, role: "customer" });
  return user.id;
}

async function insertCatalogue(database: Database, fulfilmentId: string) {
  const categoryId = randomUUID();
  const productId = randomUUID();
  const secondProductId = randomUUID();
  await database.insert(categories).values({
    id: categoryId,
    name: `Ord ${suffix}`,
    slug: `ord-${suffix.toLowerCase()}`,
    isActive: true,
  });
  await database.insert(products).values([
    {
      id: productId,
      categoryId,
      name: `Ord One ${suffix}`,
      sku: `${skuPrefix}-ONE`,
      unit: "piece",
      packageSize: 1,
      packageLabel: "1 pc",
      publicationStatus: "published",
      isActive: true,
    },
    {
      id: secondProductId,
      categoryId,
      name: `Ord Two ${suffix}`,
      sku: `${skuPrefix}-TWO`,
      unit: "piece",
      packageSize: 1,
      packageLabel: "1 pc",
      publicationStatus: "published",
      isActive: true,
    },
  ]);
  await database.insert(storeProducts).values([
    { storeId: fulfilmentId, productId, pricePaise: 1500, stockQuantity: 20, availability: "available" },
    { storeId: fulfilmentId, productId: secondProductId, pricePaise: 900, stockQuantity: 20, availability: "available" },
  ]);
  return { productId, secondProductId };
}

async function insertRegisteredOrder(
  database: Database,
  input: {
    userId: string;
    storeId: string;
    productId: string;
    quantity: number;
    unitPricePaise: number;
    customerName: string;
    customerPhone: string;
    line1: string;
    locality?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  },
) {
  const orderNumber = `GT-R${randomBytes(7).toString("hex").toUpperCase()}`;
  return withTransaction(database, async (tx) => {
    const [listing] = await tx
      .select({
        id: storeProducts.id,
        stockQuantity: storeProducts.stockQuantity,
        availability: storeProducts.availability,
      })
      .from(storeProducts)
      .where(eq(storeProducts.productId, input.productId))
      .for("update");
    if (!listing || listing.stockQuantity < input.quantity) {
      throw new Error("registered order fixture is out of stock");
    }
    const lineTotalPaise = input.unitPricePaise * input.quantity;
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId: input.userId,
        storeId: input.storeId,
        status: "placed",
        subtotalPaise: lineTotalPaise,
        deliveryFeePaise: 0,
        totalPaise: lineTotalPaise,
        paymentMethod: "cash_on_delivery",
        paymentStatus: "pending",
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    if (!order) {
      throw new Error("registered order was not stored");
    }
    const [product] = await tx.select({ name: products.name, sku: products.sku }).from(products).where(eq(products.id, input.productId));
    await tx.insert(orderItems).values({
      orderId: order.id,
      productId: input.productId,
      productName: product?.name ?? "Registered item",
      sku: product?.sku ?? `${skuPrefix}-ONE`,
      quantity: input.quantity,
      unitPricePaise: input.unitPricePaise,
      lineTotalPaise,
    });
    await tx.insert(orderAddresses).values({
      orderId: order.id,
      recipientName: input.customerName,
      phone: input.customerPhone,
      addressType: "home",
      line1: input.line1,
      locality: input.locality,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
    });
    await tx.insert(payments).values({
      orderId: order.id,
      provider: "cod",
      amountPaise: lineTotalPaise,
      status: "pending",
      idempotencyKey: `cod-${order.id.replaceAll("-", "")}`,
    });
    await tx.insert(orderStatusEvents).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "placed",
    });
    const stockAfter = listing.stockQuantity - input.quantity;
    await tx
      .update(storeProducts)
      .set({
        stockQuantity: stockAfter,
        availability: stockAfter === 0 ? "out_of_stock" : listing.availability,
      })
      .where(eq(storeProducts.id, listing.id));
    await tx.insert(inventoryMovements).values({
      storeProductId: listing.id,
      movementType: "removal",
      quantityDelta: -input.quantity,
      stockAfter,
      reason: `registered_fixture:${order.orderNumber}`,
    });
    return order;
  });
}

async function cleanup(database: Database): Promise<void> {
  const productRows = await database
    .select({ id: products.id })
    .from(products)
    .where(like(products.sku, `${skuPrefix}-%`));
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
  await database.delete(categories).where(like(categories.slug, `ord-${suffix.toLowerCase()}%`));
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
