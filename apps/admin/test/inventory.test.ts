import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminProductListResponseSchema, adminStockResponseSchema } from "@ghartak/contracts";
import { createApiClient, failureFromResponse } from "../src/lib/api/client";
import { redirectForFailure } from "../src/lib/auth/session";
import { buildStockChange, inventoryQuerySupport, planStockFailure } from "../src/lib/inventory/stock";
import { changeStock } from "../src/lib/inventory/requests";
import { productListView } from "../src/lib/products/list-state";
import { filtersFromSearchParams, productListPath, productPageSize } from "../src/lib/products/query";

const productId = "00000000-0000-4000-8000-000000000031";

describe("inventory list", () => {
  it("requests one catalogue page and does not invent a stock filter", () => {
    const filters = filtersFromSearchParams(new URLSearchParams("q=onion&page=2"));
    const path = productListPath({ ...filters, publicationStatus: "", categoryId: "" });
    assert.match(path, /\/api\/v1\/admin\/products\?/);
    assert.match(path, /page=2/);
    assert.match(path, new RegExp(`limit=${productPageSize}`));
    assert.match(path, /search=onion/);
    assert.doesNotMatch(path, /availability|out_of_stock|inStock/);
    assert.equal(inventoryQuerySupport.search, true);
    assert.equal(inventoryQuerySupport.pagination, true);
    assert.equal(inventoryQuerySupport.outOfStock, false);
    assert.equal(inventoryQuerySupport.availability, false);
    assert.equal(inventoryQuerySupport.movementHistory, false);
    assert.equal(productListView({ phase: "loading" }).kind, "loading");
    assert.equal(productListView({ phase: "error", message: "The inventory list could not be loaded." }).kind, "error");
    assert.equal(productListView({ phase: "ready", data: { products: [], pagination: { page: 1, limit: 20, total: 0, pageCount: 0 } } }).kind, "empty");
  });

  it("loads one page and sends an expired session to login", async () => {
    let requested = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        requested = String(url);
        assert.equal(init?.credentials, "include");
        return json(200, {
          products: [],
          pagination: { page: 1, limit: 20, total: 0, pageCount: 0 },
        });
      },
    });
    const filters = filtersFromSearchParams(new URLSearchParams("q=milk"));
    const result = await client.get(productListPath({ ...filters, publicationStatus: "", categoryId: "" }), adminProductListResponseSchema);
    assert.equal(result.ok, true);
    assert.match(requested, /search=milk/);
    assert.equal(redirectForFailure(failureFromResponse(401, { error: { code: "request_error", message: "Authentication required" } })), "/login");
  });
});

describe("stock changes", () => {
  it("validates an addition", () => {
    const missing = buildStockChange(40, { type: "addition", amount: "0", reason: "" });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.errors["amount"], "Enter a whole number greater than zero.");
      assert.equal(missing.errors["reason"], "A reason is required.");
    }
    const ready = buildStockChange(40, { type: "addition", amount: "4", reason: "Delivery received" });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.deepEqual(ready.projection.payload, { type: "addition", quantity: 4, reason: "Delivery received" });
      assert.equal(ready.projection.delta, 4);
      assert.equal(ready.projection.next, 44);
    }
  });

  it("validates a removal and blocks a negative result", () => {
    const fraction = buildStockChange(5, { type: "removal", amount: "1.5", reason: "Damaged" });
    assert.equal(fraction.ok, false);
    const blocked = buildStockChange(5, { type: "removal", amount: "6", reason: "Damaged" });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.errors["amount"], "This would make stock negative.");
    }
    const ready = buildStockChange(40, { type: "removal", amount: "1", reason: "Damaged" });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.deepEqual(ready.projection.payload, { type: "removal", quantity: 1, reason: "Damaged" });
      assert.equal(ready.projection.next, 39);
    }
  });

  it("validates an adjustment, including a negative delta", () => {
    const zero = buildStockChange(40, { type: "adjustment", amount: "0", reason: "Count correction" });
    assert.equal(zero.ok, false);
    const below = buildStockChange(2, { type: "adjustment", amount: "-3", reason: "Count correction" });
    assert.equal(below.ok, false);
    const ready = buildStockChange(40, { type: "adjustment", amount: "-2", reason: "Count correction" });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.deepEqual(ready.projection.payload, { type: "adjustment", quantityDelta: -2, reason: "Count correction" });
      assert.equal(ready.projection.next, 38);
    }
  });

  it("posts one stock change and keeps the returned quantity", async () => {
    let calls = 0;
    let body = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        calls += 1;
        body = String(init?.body);
        assert.equal(init?.credentials, "include");
        assert.equal(init?.method, "POST");
        assert.match(String(url), new RegExp(`/api/v1/admin/products/${productId}/stock$`));
        return json(200, {
          productId,
          inventory: { pricePaise: 12000, stockQuantity: 44, availability: "available" },
          movement: {
            id: "00000000-0000-4000-8000-000000000099",
            movementType: "addition",
            quantityDelta: 4,
            stockAfter: 44,
            reason: "Delivery received",
          },
        });
      },
    });
    const built = buildStockChange(40, { type: "addition", amount: "4", reason: "Delivery received" });
    assert.equal(built.ok, true);
    if (!built.ok) {
      return;
    }
    const result = await changeStock(client, productId, built.projection.payload);
    assert.equal(calls, 1);
    assert.equal(body, JSON.stringify(built.projection.payload));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.inventory.stockQuantity, 44);
      assert.equal(adminStockResponseSchema.safeParse(result.data).success, true);
    }
  });

  it("refreshes after a conflict and does not submit again", () => {
    const conflict = failureFromResponse(409, { error: { code: "request_error", message: "Stock cannot become negative" } });
    const plan = planStockFailure(conflict.kind);
    assert.equal(conflict.kind, "conflict");
    assert.equal(conflict.message, "Stock cannot become negative");
    assert.equal(plan.refreshProduct, true);
    assert.equal(plan.submitAgain, false);
  });

  it("stops after a network failure without another request", async () => {
    let calls = 0;
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => {
        calls += 1;
        throw new Error("offline");
      },
    });
    const built = buildStockChange(40, { type: "removal", amount: "1", reason: "Missing" });
    assert.equal(built.ok, true);
    if (!built.ok) {
      return;
    }
    const result = await changeStock(client, productId, built.projection.payload);
    const plan = result.ok ? null : planStockFailure(result.kind);
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    if (!result.ok && plan) {
      assert.equal(result.kind, "network");
      assert.equal(plan.submitAgain, false);
      assert.equal(plan.refreshProduct, false);
    }
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
