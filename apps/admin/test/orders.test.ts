import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminOrderDetailSchema,
  adminOrderListResponseSchema,
  adminOrderSummarySchema,
} from "@ghartak/contracts";
import { createApiClient, failureFromResponse } from "../src/lib/api/client";
import { redirectForFailure } from "../src/lib/auth/session";
import { formatDeliveryAddress, paymentMethodLabel } from "../src/lib/orders/address";
import { beginOrderAction, orderListView, validateCancelReason } from "../src/lib/orders/list-state";
import { filtersFromSearchParams, orderListPath, orderPageSize, ordersPageHref } from "../src/lib/orders/query";
import { cancelOrder, fetchOrder, fetchOrderPage, fetchOrderSummary, updateOrderStatus } from "../src/lib/orders/requests";
import { canCancelOrder, nextOrderActionLabel, nextOrderStatus, orderStatusLabel } from "../src/lib/orders/status";

const orderId = "10000000-0000-4000-8000-000000000101";
const productId = "10000000-0000-4000-8000-000000000031";

describe("order list filters", () => {
  it("sends search, filters, and pagination to the admin orders API", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams("number=GT-ABC&name=Ramu&phone=9876500001&status=placed&payment=pending&method=cash_on_delivery&type=guest&page=2"),
    );
    const path = orderListPath(filters);
    assert.match(path, /page=2/);
    assert.match(path, new RegExp(`limit=${orderPageSize}`));
    assert.match(path, /orderNumber=GT-ABC/);
    assert.match(path, /customerName=Ramu/);
    assert.match(path, /customerPhone=9876500001/);
    assert.match(path, /status=placed/);
    assert.match(path, /paymentStatus=pending/);
    assert.match(path, /paymentMethod=cash_on_delivery/);
    assert.match(path, /customerType=guest/);
    assert.equal(ordersPageHref({ ...filters, page: 1 }).startsWith("/orders?"), true);
    assert.equal(orderListView({ phase: "loading" }).kind, "loading");
    assert.equal(orderListView({ phase: "error", message: "The order list could not be loaded." }).kind, "error");
    assert.equal(
      orderListView({
        phase: "ready",
        data: { orders: [], pagination: { page: 1, limit: 20, total: 0, pageCount: 0 } },
        summary: null,
      }).kind,
      "empty",
    );
  });

  it("loads one page of guest and registered orders with credentials", async () => {
    let requested = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        requested = String(url);
        assert.equal(init?.credentials, "include");
        return json(200, {
          orders: [listItem("guest", "Guest Ramu"), listItem("registered", "Registered Sita")],
          pagination: { page: 1, limit: 20, total: 2, pageCount: 1 },
        });
      },
    });
    const result = await fetchOrderPage(client, filtersFromSearchParams(new URLSearchParams("type=guest")));
    assert.equal(result.ok, true);
    assert.match(requested, /\/api\/v1\/admin\/orders\?/);
    assert.match(requested, /customerType=guest/);
    if (result.ok) {
      assert.equal(result.data.orders[0]?.customerType, "guest");
      assert.equal(result.data.orders[1]?.customerType, "registered");
      assert.equal(adminOrderListResponseSchema.safeParse(result.data).success, true);
    }
    const expired = failureFromResponse(401, { error: { code: "request_error", message: "Authentication required" } });
    assert.equal(redirectForFailure(expired), "/login");
  });

  it("loads summary cards from the API without treating unpaid COD as collected", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () =>
        json(200, {
          totalOrders: 4,
          placed: 1,
          confirmed: 1,
          packed: 0,
          outForDelivery: 0,
          delivered: 1,
          cancelled: 1,
          guestOrders: 3,
          registeredOrders: 1,
          codAwaitingPaymentCount: 2,
          codAwaitingCollectionPaise: 5400,
        }),
    });
    const result = await fetchOrderSummary(client);
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = adminOrderSummarySchema.parse(result.data);
      assert.equal(parsed.placed, 1);
      assert.equal(parsed.codAwaitingCollectionPaise, 5400);
      assert.equal(parsed.codAwaitingPaymentCount, 2);
    }
  });
});

describe("order detail and actions", () => {
  it("shows snapshot prices and formatted guest address", async () => {
    const detail = sampleDetail();
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => json(200, detail),
    });
    const result = await fetchOrder(client, orderId);
    assert.equal(result.ok, true);
    if (result.ok) {
      const parsed = adminOrderDetailSchema.parse(result.data);
      assert.equal(parsed.items[0]?.unitPricePaise, 1500);
      assert.equal(parsed.items[0]?.lineTotalPaise, 3000);
      assert.equal(parsed.totalPaise, 3000);
      assert.match(formatDeliveryAddress(parsed.address), /House near the school/);
      assert.equal(paymentMethodLabel(parsed.paymentMethod), "Cash on delivery");
    }
  });

  it("advances only the next valid status and blocks duplicate clicks", async () => {
    assert.equal(orderStatusLabel("placed"), "New");
    assert.equal(orderStatusLabel("packed"), "Preparing");
    assert.equal(nextOrderStatus("placed"), "confirmed");
    assert.equal(nextOrderActionLabel("placed"), "Confirm order");
    assert.equal(nextOrderStatus("delivered"), null);
    assert.equal(canCancelOrder("delivered"), false);
    assert.equal(canCancelOrder("cancelled"), false);
    assert.equal(canCancelOrder("placed"), true);
    assert.equal(beginOrderAction(false), true);
    assert.equal(beginOrderAction(true), false);

    let bodies: unknown[] = [];
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (_url, init) => {
        bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return json(200, { ...sampleDetail(), status: "confirmed" });
      },
    });
    const result = await updateOrderStatus(client, orderId, "confirmed");
    assert.equal(result.ok, true);
    assert.deepEqual(bodies[0], { status: "confirmed" });
  });

  it("requires a cancellation reason and prevents a second submit while pending", async () => {
    assert.equal(validateCancelReason("   "), "A cancellation reason is required.");
    assert.equal(validateCancelReason("x".repeat(201)), "Use 200 characters or fewer.");
    assert.equal(validateCancelReason("Customer asked to stop"), null);
    let calls = 0;
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => {
        calls += 1;
        return json(200, { ...sampleDetail(), status: "cancelled" });
      },
    });
    const first = await cancelOrder(client, orderId, "Customer asked to stop");
    assert.equal(first.ok, true);
    assert.equal(beginOrderAction(true), false);
    assert.equal(calls, 1);
  });

  it("surfaces conflict and unauthorized errors without raw stack traces", async () => {
    const conflict = failureFromResponse(409, {
      error: { code: "already_cancelled", message: "This order is already cancelled" },
    });
    assert.equal(conflict.kind, "conflict");
    assert.equal(conflict.message, "This order is already cancelled");
    const missing = failureFromResponse(404, { error: { code: "not_found", message: "Order not found" } });
    assert.equal(missing.kind, "invalid");
    const boom = failureFromResponse(500, { error: { code: "internal_error", message: "stack\ntrace" } });
    assert.equal(boom.kind, "unexpected");
    assert.equal(boom.message.includes("stack"), false);
    assert.equal(redirectForFailure(failureFromResponse(401, { error: { code: "request_error", message: "Authentication required" } })), "/login");
    assert.equal(redirectForFailure(failureFromResponse(403, { error: { code: "request_error", message: "You do not have access" } })), "/login");
  });
});

function listItem(customerType: "guest" | "registered", customerName: string) {
  return {
    id: customerType === "guest" ? orderId : "10000000-0000-4000-8000-000000000102",
    orderNumber: customerType === "guest" ? "GT-GUEST1" : "GT-REG1",
    customerName,
    customerPhone: "+919876500001",
    customerType,
    status: "placed",
    paymentMethod: "cash_on_delivery",
    paymentStatus: "pending",
    itemCount: 1,
    subtotalPaise: 1500,
    deliveryFeePaise: 0,
    totalPaise: 1500,
    createdAt: "2026-10-30T18:30:00.000Z",
  };
}

function sampleDetail() {
  return {
    id: orderId,
    orderNumber: "GT-GUEST1",
    status: "placed",
    customerType: "guest",
    customerName: "Guest Ramu",
    customerPhone: "+919876500001",
    userId: null,
    address: {
      recipientName: "Guest Ramu",
      phone: "+919876500001",
      addressType: "other",
      line1: "House near the school",
      line2: null,
      landmark: null,
      locality: null,
      city: null,
      state: null,
      postalCode: null,
      latitude: null,
      longitude: null,
    },
    items: [
      {
        productId,
        productName: "Toor Dal",
        quantity: 2,
        unitPricePaise: 1500,
        lineTotalPaise: 3000,
      },
    ],
    subtotalPaise: 3000,
    deliveryFeePaise: 0,
    discountPaise: 0,
    taxPaise: 0,
    totalPaise: 3000,
    paymentMethod: "cash_on_delivery",
    paymentStatus: "pending",
    payment: { provider: "cod", amountPaise: 3000, status: "pending" },
    statusHistory: [
      {
        fromStatus: null,
        toStatus: "placed",
        note: null,
        actor: null,
        createdAt: "2026-10-30T18:30:00.000Z",
      },
    ],
    createdAt: "2026-10-30T18:30:00.000Z",
    updatedAt: "2026-10-30T18:30:00.000Z",
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
