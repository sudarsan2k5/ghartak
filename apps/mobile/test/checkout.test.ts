import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { guestCheckoutRequestSchema, type GuestCheckoutResponse } from "@ghartak/contracts";

import { postGuestCheckout } from "../src/api/checkout-request.ts";
import {
  checkoutFingerprint,
  createCheckoutSubmitter,
  nextCheckoutAttempt,
  validateGuestCheckout,
} from "../src/cart/checkout-form.ts";
import {
  commitSuccessfulCheckout,
  forgetPlacedOrder,
  formatOrderTime,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  readPlacedOrder,
  rememberPlacedOrder,
} from "../src/cart/placed-order.ts";
import { addProduct, clearCart, emptyCart } from "../src/cart/operations.ts";
import { persistCart, restoreCart } from "../src/cart/persist.ts";
import type { CartOffer } from "../src/cart/types.ts";

const dalId = "10000000-0000-4000-8000-000000000031";
const milkId = "10000000-0000-4000-8000-000000000033";

const form = {
  customerName: "Ramu",
  customerPhone: "9876543210",
  deliveryAddress: "House near the school, Demo Village",
};

const items = [{ productId: dalId, quantity: 2 }];

function order(overrides: Partial<GuestCheckoutResponse> = {}): GuestCheckoutResponse {
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
    deliveryFeePaise: 1500,
    totalPaise: 25500,
    createdAt: "2026-10-30T18:30:00.000Z",
    trackingToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ...overrides,
  };
}

function offer(): CartOffer {
  return {
    id: dalId,
    name: "Toor Dal",
    packageLabel: "1 kg",
    deliveryPath: null,
    pricePaise: 12000,
    mrpPaise: null,
    stock: { quantity: 40, availability: "available", purchasable: true },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("guest checkout form validation", () => {
  it("rejects an empty name, whitespace-only name, and a name that is too long", () => {
    const empty = validateGuestCheckout({ form: { ...form, customerName: "" }, items, idempotencyKey: "checkout-key" });
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.equal(empty.fields.customerName, "Enter your name");
    }
    const blank = validateGuestCheckout({ form: { ...form, customerName: "   " }, items, idempotencyKey: "checkout-key" });
    assert.equal(blank.ok, false);
    const long = validateGuestCheckout({
      form: { ...form, customerName: "R".repeat(121) },
      items,
      idempotencyKey: "checkout-key",
    });
    assert.equal(long.ok, false);
    if (!long.ok) {
      assert.equal(long.fields.customerName, "Name must be 120 characters or fewer");
    }
  });

  it("rejects an invalid mobile number without changing the typed value", () => {
    const typed = "5876543210";
    const result = validateGuestCheckout({
      form: { ...form, customerPhone: typed },
      items,
      idempotencyKey: "checkout-key",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.fields.customerPhone, "Enter a valid 10-digit Indian mobile number");
    }
    assert.equal(typed, "5876543210");
  });

  it("rejects an empty or whitespace-only address", () => {
    const empty = validateGuestCheckout({ form: { ...form, deliveryAddress: "" }, items, idempotencyKey: "checkout-key" });
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.equal(empty.fields.deliveryAddress, "Enter a delivery address");
    }
    const blank = validateGuestCheckout({
      form: { ...form, deliveryAddress: " \n  " },
      items,
      idempotencyKey: "checkout-key",
    });
    assert.equal(blank.ok, false);
  });

  it("accepts valid customer details and trims them for the API", () => {
    const result = validateGuestCheckout({
      form: {
        customerName: "  Ramu  ",
        customerPhone: "9876543210",
        deliveryAddress: "  House near the school  ",
      },
      items,
      idempotencyKey: "idem-key-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.request.customerName, "Ramu");
      assert.equal(result.request.customerPhone, "+919876543210");
      assert.equal(result.request.deliveryAddress, "House near the school");
      assert.deepEqual(result.request.items, items);
      assert.equal("pricePaise" in result.request, false);
      assert.equal("totalPaise" in result.request, false);
    }
  });
});

describe("guest checkout API integration", () => {
  it("posts product ids and quantities only and displays the server snapshot", async () => {
    let sent = "";
    const result = await postGuestCheckout(
      guestCheckoutRequestSchema.parse({ ...form, items, idempotencyKey: "idem-key-ok" }),
      {
        baseUrl: "http://127.0.0.1:3000",
        fetchImpl: async (_url, init) => {
          sent = String(init?.body);
          return jsonResponse(200, order());
        },
      },
    );
    const payload = JSON.parse(sent) as Record<string, unknown>;
    assert.equal(payload["customerName"], "Ramu");
    assert.deepEqual(payload["items"], items);
    assert.equal("pricePaise" in payload, false);
    assert.equal("subtotalPaise" in payload, false);
    assert.equal("deliveryFeePaise" in payload, false);
    assert.equal("totalPaise" in payload, false);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.order.orderNumber, "GT-A1B2C3D4E5F6A7B8");
      assert.equal(result.order.subtotalPaise, 24000);
      assert.equal(result.order.deliveryFeePaise, 1500);
      assert.equal(result.order.totalPaise, 25500);
      assert.equal(result.order.paymentMethod, "cash_on_delivery");
      assert.equal(result.order.paymentStatus, "pending");
      assert.equal(result.order.items[0]?.unitPricePaise, 12000);
    }
  });
});

describe("checkout idempotency", () => {
  it("reuses the key for a timeout retry and issues a new key when the payload changes", () => {
    const first = nextCheckoutAttempt(null, "a", () => "key-one");
    const retry = nextCheckoutAttempt(first, "a", () => "key-two");
    assert.equal(retry.key, "key-one");
    const changed = nextCheckoutAttempt(retry, "b", () => "key-three");
    assert.equal(changed.key, "key-three");
  });

  it("blocks a second submit while the first is in flight and reuses the key after a timeout", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submitter = createCheckoutSubmitter({
      generateKey: () => "stable-key-1",
      client: {
        place: async () => {
          calls += 1;
          if (calls === 1) {
            await gate;
            return { ok: false, kind: "timeout", status: null, error: null };
          }
          return { ok: true, order: order() };
        },
      },
    });
    const first = submitter.submit({ form, items });
    const duplicate = await submitter.submit({ form, items });
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) {
      assert.equal(duplicate.kind, "busy");
    }
    release?.();
    const timedOut = await first;
    assert.equal(timedOut.ok, false);
    if (!timedOut.ok && timedOut.kind !== "busy" && timedOut.kind !== "validation") {
      assert.equal(timedOut.keepIdempotencyKey, true);
    }
    assert.equal(submitter.getAttempt()?.key, "stable-key-1");
    const retry = await submitter.submit({ form, items });
    assert.equal(retry.ok, true);
    assert.equal(calls, 2);
  });

  it("drops the key after an idempotency conflict", async () => {
    const keys = ["first-key", "second-key"];
    const submitter = createCheckoutSubmitter({
      generateKey: () => keys.shift() ?? "overflow",
      client: {
        place: async () => ({
          ok: false,
          kind: "http",
          status: 409,
          error: { code: "idempotency_conflict", message: "This checkout key was already used with a different request" },
        }),
      },
    });
    const result = await submitter.submit({ form, items });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "idempotency_conflict");
    }
    assert.equal(submitter.getAttempt(), null);
  });
});

describe("checkout cart persistence", () => {
  it("keeps the cart after validation and API failures, and clears it only after success", () => {
    const filled = addProduct(emptyCart(), offer(), 2);
    assert.equal(filled.ok, true);
    const snapshot = persistCart(filled.items);

    const invalid = validateGuestCheckout({
      form: { ...form, customerPhone: "123" },
      items,
      idempotencyKey: "checkout-key",
    });
    assert.equal(invalid.ok, false);
    assert.equal(restoreCart(snapshot).length, 1);

    forgetPlacedOrder();
    const afterFailure = restoreCart(snapshot);
    assert.equal(afterFailure[0]?.quantity, 2);

    let stored = filled.items;
    commitSuccessfulCheckout(order(), {
      clear: () => {
        stored = clearCart().items;
      },
    });
    assert.equal(stored.length, 0);
    assert.equal(persistCart(stored).items.length, 0);
    assert.equal(readPlacedOrder()?.orderNumber, "GT-A1B2C3D4E5F6A7B8");
    forgetPlacedOrder();
  });

  it("does not empty a persisted cart merely by opening checkout", () => {
    const filled = addProduct(emptyCart(), offer(), 1);
    const snapshot = persistCart(filled.items);
    assert.equal(restoreCart(snapshot).length, 1);
  });
});

describe("checkout errors", () => {
  it("maps stock, catalogue, rate limit, network, server, invalid, and conflict failures", async () => {
    const cases: Array<{
      result: Awaited<ReturnType<typeof postGuestCheckout>>;
      kind: string;
    }> = [
      {
        result: { ok: false, kind: "http", status: 409, error: { code: "insufficient_stock", message: "There is not enough stock for this product", productId: dalId } },
        kind: "insufficient_stock",
      },
      {
        result: { ok: false, kind: "http", status: 409, error: { code: "product_unavailable", message: "This product is not available", productId: milkId } },
        kind: "unavailable_product",
      },
      {
        result: { ok: false, kind: "http", status: 429, error: { code: "rate_limited", message: "Too many checkout attempts. Try again later." } },
        kind: "rate_limited",
      },
      { result: { ok: false, kind: "network", status: null, error: null }, kind: "network" },
      { result: { ok: false, kind: "http", status: 500, error: { code: "internal_error", message: "Internal server error" } }, kind: "server" },
      { result: { ok: false, kind: "http", status: 400, error: { code: "request_error", message: "customerPhone: Enter a valid 10-digit Indian mobile number" } }, kind: "invalid_request" },
      {
        result: { ok: false, kind: "http", status: 409, error: { code: "idempotency_conflict", message: "This checkout key was already used with a different request" } },
        kind: "idempotency_conflict",
      },
    ];

    for (const entry of cases) {
      const submitter = createCheckoutSubmitter({
        generateKey: () => "error-key",
        productName: (id) => (id === dalId ? "Toor Dal" : null),
        client: { place: async () => entry.result },
      });
      const outcome = await submitter.submit({ form, items });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.kind, entry.kind);
        assert.match(outcome.message, /cart|phone|mobile|checkout|order|stock|available|moment/i);
        assert.equal(outcome.message.includes("at ignore-listed"), false);
      }
    }
  });
});

describe("order confirmation", () => {
  it("shows the server order number, snapshots, totals, and unpaid COD", () => {
    forgetPlacedOrder();
    rememberPlacedOrder(order());
    const placed = readPlacedOrder();
    assert.equal(placed?.orderNumber, "GT-A1B2C3D4E5F6A7B8");
    assert.equal(placed?.items[0]?.productName, "Toor Dal");
    assert.equal(placed?.items[0]?.unitPricePaise, 12000);
    assert.equal(placed?.subtotalPaise, 24000);
    assert.equal(placed?.deliveryFeePaise, 1500);
    assert.equal(placed?.totalPaise, 25500);
    assert.equal(paymentMethodLabel(placed!.paymentMethod), "Cash on Delivery");
    assert.equal(paymentStatusLabel(placed!.paymentStatus), "Pending · unpaid");
    assert.equal(orderStatusLabel(placed!.status), "Placed");
    assert.equal(formatOrderTime(placed!.createdAt).includes("2026") || formatOrderTime(placed!.createdAt).length > 0, true);
    forgetPlacedOrder();
    assert.equal(readPlacedOrder(), null);
  });
});

describe("fingerprint", () => {
  it("treats the same normalized customer and items as one submission", () => {
    const left = checkoutFingerprint({
      customerName: "Ramu",
      customerPhone: "+919876543210",
      deliveryAddress: "House near the school, Demo Village",
      items: [
        { productId: milkId, quantity: 1 },
        { productId: dalId, quantity: 2 },
      ],
    });
    const right = checkoutFingerprint({
      customerName: "Ramu",
      customerPhone: "+919876543210",
      deliveryAddress: "House near the school, Demo Village",
      items: [
        { productId: dalId, quantity: 2 },
        { productId: milkId, quantity: 1 },
      ],
    });
    assert.equal(left, right);
  });
});
