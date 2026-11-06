import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { CustomerOrderStatusResponse, GuestCheckoutResponse } from "@ghartak/contracts";

import { getCustomerOrderStatus } from "../src/api/order-status.ts";
import { createCheckoutSubmitter } from "../src/cart/checkout-form.ts";
import { commitSuccessfulCheckout, forgetPlacedOrder, readPlacedOrder } from "../src/cart/placed-order.ts";
import { cartStorageKey } from "../src/cart/types.ts";
import {
  canRefreshOrderStatus,
  trackingCopy,
  trackingErrorCopy,
  trackingStatusExplanation,
  trackingStatusLabel,
} from "../src/tracking/copy.ts";
import {
  createMemorySecretStore,
  listTrackingSummaries,
  readLatestTrackingOrderNumber,
  readTrackingPersistError,
  readTrackingToken,
  resetTrackingCredentialsForTests,
  saveTrackingCredential,
  setTrackingSecretStoreForTests,
  trackingVaultKey,
} from "../src/tracking/credentials.ts";
import { buildTrackingTimeline, cancelledEventTime, hasFabricatedPendingTime } from "../src/tracking/timeline.ts";

const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const otherToken = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const dalId = "10000000-0000-4000-8000-000000000031";

afterEach(() => {
  resetTrackingCredentialsForTests();
  setTrackingSecretStoreForTests(null);
  forgetPlacedOrder();
});

function placedOrder(overrides: Partial<GuestCheckoutResponse> = {}): GuestCheckoutResponse {
  return {
    orderNumber: "GT-A1B2C3D4E5F6A7B8",
    status: "placed",
    paymentMethod: "cash_on_delivery",
    paymentStatus: "pending",
    customerName: "Ramu",
    items: [
      {
        productId: dalId,
        productName: "Toor Dal",
        quantity: 2,
        unitPricePaise: 12000,
        lineTotalPaise: 24000,
      },
    ],
    subtotalPaise: 24000,
    deliveryFeePaise: 0,
    totalPaise: 24000,
    createdAt: "2026-10-31T08:00:00.000Z",
    trackingToken: token,
    ...overrides,
  };
}

function status(overrides: Partial<CustomerOrderStatusResponse> = {}): CustomerOrderStatusResponse {
  return {
    orderNumber: "GT-A1B2C3D4E5F6A7B8",
    status: "placed",
    updatedAt: "2026-10-31T08:00:00.000Z",
    events: [{ status: "placed", createdAt: "2026-10-31T08:00:00.000Z" }],
    ...overrides,
  };
}

describe("secure tracking storage", () => {
  it("saves and retrieves a tracking credential without AsyncStorage", async () => {
    const store = createMemorySecretStore();
    const asyncStorage = new Map<string, string>();
    setTrackingSecretStoreForTests(store);
    const saved = await saveTrackingCredential({ orderNumber: "GT-A1B2C3D4E5F6A7B8", token });
    assert.equal(saved.ok, true);
    assert.equal(await readTrackingToken("GT-A1B2C3D4E5F6A7B8"), token);
    assert.equal(await readLatestTrackingOrderNumber(), "GT-A1B2C3D4E5F6A7B8");
    assert.equal(store.records.has(trackingVaultKey), true);
    assert.equal(store.records.has(cartStorageKey), false);
    assert.equal(asyncStorage.size, 0);
    const vault = store.records.get(trackingVaultKey) ?? "";
    assert.match(vault, /GT-A1B2C3D4E5F6A7B8/);
    assert.equal(JSON.parse(vault).orders[0].token, token);
  });

  it("restores tracking after in-memory session is cleared", async () => {
    const store = createMemorySecretStore();
    setTrackingSecretStoreForTests(store);
    await saveTrackingCredential({ orderNumber: "GT-A1B2C3D4E5F6A7B8", token });
    resetTrackingCredentialsForTests();
    assert.equal(await readLatestTrackingOrderNumber(), "GT-A1B2C3D4E5F6A7B8");
    assert.equal(await readTrackingToken("GT-A1B2C3D4E5F6A7B8"), token);
  });

  it("handles missing credentials and store errors", async () => {
    setTrackingSecretStoreForTests(createMemorySecretStore());
    assert.equal(await readLatestTrackingOrderNumber(), null);
    assert.equal(await readTrackingToken("GT-MISSING"), null);
    assert.deepEqual(await listTrackingSummaries(), []);

    setTrackingSecretStoreForTests({
      getItem: async () => {
        throw new Error("locked");
      },
      setItem: async () => {
        throw new Error("locked");
      },
    });
    const failed = await saveTrackingCredential({ orderNumber: "GT-A1B2C3D4E5F6A7B8", token });
    assert.equal(failed.ok, false);
    assert.equal(readTrackingPersistError()?.includes("tracking could not be saved"), true);
    assert.equal(await readTrackingToken("GT-A1B2C3D4E5F6A7B8"), token);
  });
});

describe("checkout tracking integration", () => {
  it("saves credentials after a successful checkout and does not resubmit when persistence fails", async () => {
    const store = createMemorySecretStore();
    setTrackingSecretStoreForTests(store);
    let places = 0;
    const submitter = createCheckoutSubmitter({
      generateKey: () => "checkout-key-1",
      client: {
        place: async () => {
          places += 1;
          return { ok: true, order: placedOrder() };
        },
      },
    });
    const result = await submitter.submit({
      form: {
        customerName: "Ramu",
        customerPhone: "9876543210",
        deliveryAddress: "House near the school",
      },
      items: [{ productId: dalId, quantity: 1 }],
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    let cleared = false;
    commitSuccessfulCheckout(result.order, { clear: () => { cleared = true; } });
    const saved = await saveTrackingCredential({
      orderNumber: result.order.orderNumber,
      token: result.order.trackingToken,
    });
    assert.equal(saved.ok, true);
    assert.equal(cleared, true);
    assert.equal(places, 1);
    assert.equal(readPlacedOrder()?.orderNumber, "GT-A1B2C3D4E5F6A7B8");

    setTrackingSecretStoreForTests({
      getItem: async () => null,
      setItem: async () => {
        throw new Error("full");
      },
    });
    const persist = await saveTrackingCredential({
      orderNumber: result.order.orderNumber,
      token: result.order.trackingToken,
    });
    assert.equal(persist.ok, false);
    assert.equal(places, 1);
    assert.equal(readPlacedOrder()?.orderNumber, "GT-A1B2C3D4E5F6A7B8");
  });

  it("does not treat confirmation copy as a place to render the token", () => {
    const order = placedOrder();
    const visible = [
      order.orderNumber,
      trackingCopy.trackAction,
      trackingStatusLabel(order.status),
      order.customerName,
    ].join(" ");
    assert.equal(visible.includes(order.trackingToken), false);
    assert.equal(JSON.stringify({ title: trackingCopy.persistFailedTitle }).includes(token), false);
  });
});

describe("order status API and timeline", () => {
  it("fetches status with a bearer token and never puts the token in the URL", async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
    const result = await getCustomerOrderStatus(token, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers });
        return new Response(
          JSON.stringify(status({ status: "confirmed", events: [
            { status: "placed", createdAt: "2026-10-31T08:00:00.000Z" },
            { status: "confirmed", createdAt: "2026-10-31T08:10:00.000Z" },
          ] })),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.order.status, "confirmed");
    }
    assert.equal(calls[0]?.url, "http://127.0.0.1:3000/api/v1/orders/status");
    assert.equal(calls[0]?.url.includes(token), false);
    assert.equal(calls[0]?.url.includes("?"), false);
    const headers = new Headers(calls[0]?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${token}`);
  });

  it("renders actual events in order and does not timestamp pending steps", () => {
    const packed = status({
      status: "packed",
      events: [
        { status: "confirmed", createdAt: "2026-10-31T08:10:00.000Z" },
        { status: "placed", createdAt: "2026-10-31T08:00:00.000Z" },
        { status: "packed", createdAt: "2026-10-31T08:15:00.000Z" },
      ],
    });
    const steps = buildTrackingTimeline(packed);
    assert.deepEqual(
      steps.map((step) => step.status),
      ["placed", "confirmed", "packed", "out_for_delivery", "delivered"],
    );
    assert.equal(steps[0]?.state, "complete");
    assert.equal(steps[1]?.state, "complete");
    assert.equal(steps[2]?.state, "current");
    assert.equal(steps[3]?.state, "pending");
    assert.equal(steps[4]?.state, "pending");
    assert.equal(steps[0]?.occurredAt, "2026-10-31T08:00:00.000Z");
    assert.equal(steps[3]?.occurredAt, null);
    assert.equal(steps[4]?.occurredAt, null);
    assert.equal(hasFabricatedPendingTime(steps), false);
  });

  it("marks a delivered order complete and hides cancellation reasons", () => {
    const delivered = buildTrackingTimeline(
      status({
        status: "delivered",
        events: [
          { status: "placed", createdAt: "2026-10-31T08:00:00.000Z" },
          { status: "confirmed", createdAt: "2026-10-31T08:05:00.000Z" },
          { status: "packed", createdAt: "2026-10-31T08:10:00.000Z" },
          { status: "out_for_delivery", createdAt: "2026-10-31T08:20:00.000Z" },
          { status: "delivered", createdAt: "2026-10-31T08:40:00.000Z" },
        ],
      }),
    );
    assert.ok(delivered.every((step) => step.state === "complete" || step.status === "delivered"));
    assert.equal(delivered[4]?.state, "current");
    const cancelled = status({
      status: "cancelled",
      events: [
        { status: "placed", createdAt: "2026-10-31T08:00:00.000Z" },
        { status: "cancelled", createdAt: "2026-10-31T08:12:00.000Z" },
      ],
    });
    assert.deepEqual(buildTrackingTimeline(cancelled), []);
    assert.equal(cancelledEventTime(cancelled.events), "2026-10-31T08:12:00.000Z");
    assert.equal(trackingStatusExplanation("cancelled").toLowerCase().includes("warehouse"), false);
    assert.equal(JSON.stringify(cancelled).includes("actor"), false);
  });

  it("prevents duplicate refresh while a request is in flight", () => {
    assert.equal(canRefreshOrderStatus(true), false);
    assert.equal(canRefreshOrderStatus(false), true);
  });

  it("maps recoverable and unavailable API errors without dropping the stored token", async () => {
    setTrackingSecretStoreForTests(createMemorySecretStore());
    await saveTrackingCredential({ orderNumber: "GT-A1B2C3D4E5F6A7B8", token });
    const cases: Array<{ status: number; kind: string }> = [
      { status: 401, kind: "unauthorized" },
      { status: 404, kind: "unavailable" },
      { status: 429, kind: "rate_limited" },
      { status: 500, kind: "server" },
      { status: 503, kind: "server" },
    ];
    for (const entry of cases) {
      const result = await getCustomerOrderStatus(otherToken, {
        baseUrl: "http://127.0.0.1:3000",
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: { code: "not_found", message: "Order not found" } }), {
            status: entry.status,
            headers: { "content-type": "application/json" },
          }),
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.kind, entry.kind);
        const copy = trackingErrorCopy(result.kind);
        assert.equal(copy.retry, entry.status === 429 || entry.status >= 500);
        assert.equal(copy.body.includes("internal"), false);
      }
    }
    const network = await getCustomerOrderStatus(token, {
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(network.ok, false);
    if (!network.ok) {
      assert.equal(network.kind, "network");
      assert.equal(trackingErrorCopy(network.kind).retry, true);
    }
    assert.equal(await readTrackingToken("GT-A1B2C3D4E5F6A7B8"), token);
  });
});
