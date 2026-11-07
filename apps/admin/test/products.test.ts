import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminPriceResponseSchema, adminProductListResponseSchema, adminProductSchema } from "@ghartak/contracts";
import { createApiClient, failureFromResponse } from "../src/lib/api/client";
import { redirectForFailure } from "../src/lib/auth/session";
import { archiveConfirmed, productListView } from "../src/lib/products/list-state";
import { emptyProductDraft, errorSummary, validateCreate, validateUpdate, type LoadedProduct } from "../src/lib/products/form";
import { resolveProductImage } from "../src/lib/products/images";
import { paiseToRupeeInput, rupeesToPaise } from "../src/lib/products/money";
import { filtersFromSearchParams, productListPath, productPageSize } from "../src/lib/products/query";
import { imageManagerActions } from "../src/lib/products/image-actions";
import {
  archiveProduct,
  cancelProductImageDeletion,
  createProduct,
  deleteProductImage,
  fetchProductPage,
  reorderProductImages,
  retryProductImageDeletion,
  updateProduct,
  updateProductImage,
  updateProductPrice,
  uploadProductImage,
} from "../src/lib/products/requests";

const categoryId = "00000000-0000-4000-8000-000000000021";
const productId = "00000000-0000-4000-8000-000000000031";

describe("prices", () => {
  it("converts rupees to integer paise without rounding surprises", () => {
    assert.deepEqual(rupeesToPaise("120"), { ok: true, paise: 12000 });
    assert.deepEqual(rupeesToPaise("56.5"), { ok: true, paise: 5650 });
    assert.deepEqual(rupeesToPaise("56.50"), { ok: true, paise: 5650 });
    assert.deepEqual(rupeesToPaise("0.01"), { ok: true, paise: 1 });
    assert.deepEqual(rupeesToPaise("0.10"), { ok: true, paise: 10 });
    assert.equal(rupeesToPaise("10.555").ok, false);
    assert.equal(rupeesToPaise("1,200").ok, false);
    assert.equal(rupeesToPaise("-1").ok, false);
    assert.equal(paiseToRupeeInput(12000), "120");
    assert.equal(paiseToRupeeInput(5650), "56.50");
    assert.equal(paiseToRupeeInput(1), "0.01");
  });
});

describe("product list", () => {
  it("builds one page query and describes loading, empty, and error views", () => {
    const filters = filtersFromSearchParams(new URLSearchParams("q=milk&status=published&category=" + categoryId + "&page=2"));
    const path = productListPath(filters);
    assert.match(path, /page=2/);
    assert.match(path, new RegExp(`limit=${productPageSize}`));
    assert.match(path, /search=milk/);
    assert.match(path, /publicationStatus=published/);
    assert.match(path, new RegExp(`categoryId=${categoryId}`));
    assert.equal(productListView({ phase: "loading" }).kind, "loading");
    assert.equal(productListView({ phase: "error", message: "The product list could not be loaded." }).kind, "error");
    assert.equal(productListView({ phase: "ready", data: { products: [], pagination: { page: 1, limit: 20, total: 0, pageCount: 0 } } }).kind, "empty");
  });

  it("loads one page and treats an expired session as a login redirect", async () => {
    let requested = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        requested = String(url);
        assert.equal(init?.credentials, "include");
        return json(200, {
          products: [summary()],
          pagination: { page: 1, limit: 20, total: 1, pageCount: 1 },
        });
      },
    });
    const filters = filtersFromSearchParams(new URLSearchParams("q=onion"));
    const result = await fetchProductPage(client, filters);
    assert.equal(result.ok, true);
    assert.match(requested, /\/api\/v1\/admin\/products\?/);
    assert.match(requested, /search=onion/);
    const expired = failureFromResponse(401, { error: { code: "request_error", message: "Authentication required" } });
    assert.equal(redirectForFailure(expired), "/login");
    const forbidden = failureFromResponse(403, { error: { code: "request_error", message: "You do not have access to this resource" } });
    assert.equal(redirectForFailure(forbidden), "/login");
    const parsed = adminProductListResponseSchema.safeParse(result.ok ? result.data : null);
    assert.equal(parsed.success, true);
  });
});

describe("product mutations", () => {
  it("rejects an incomplete product and keeps a valid create payload as a draft in paise", () => {
    const missing = validateCreate({ ...emptyProductDraft(), openingStock: "4" });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.errors["openingReason"], "Opening stock requires a reason.");
      assert.equal(missing.errors["sku"], "Use uppercase letters, numbers, and single hyphens.");
    }
    const created = validateCreate({
      ...emptyProductDraft(),
      name: "Jaggery",
      sku: "jaggery-1kg",
      categoryId,
      unit: "kg",
      packageSize: "1",
      packageLabel: "1 kg",
      priceRupees: "56.50",
      openingStock: "4",
      openingReason: "Opening count",
      brand: "",
      barcode: "",
    });
    assert.equal(created.ok, false);
    const ready = validateCreate({
      ...emptyProductDraft(),
      name: "Jaggery",
      sku: "JAGGERY-1KG",
      categoryId,
      unit: "kg",
      packageSize: "1",
      packageLabel: "1 kg",
      priceRupees: "56.50",
      openingStock: "4",
      openingReason: "Opening count",
    });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.equal(ready.payload.pricePaise, 5650);
      assert.equal(ready.payload.openingStockQuantity, 4);
      assert.equal(ready.payload.publicationStatus, undefined);
      assert.equal("pricePaise" in ready.payload, true);
      assert.equal(Object.hasOwn(ready.payload, "brand"), false);
    }
  });

  it("creates, edits, prices, and archives through the existing endpoints", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        calls.push({ method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
        assert.equal(init?.credentials, "include");
        if (String(url).endsWith("/price")) {
          return json(200, { productId, inventory: { pricePaise: 6400, stockQuantity: 4, availability: "available" } });
        }
        return json(200, detail());
      },
    });
    const created = await createProduct(client, { name: "Jaggery", pricePaise: 5650 });
    const edited = await updateProduct(client, productId, { name: "Jaggery block" });
    const priced = await updateProductPrice(client, productId, 6400);
    const archived = await archiveProduct(client, productId);
    assert.equal(created.ok && edited.ok && priced.ok && archived.ok, true);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url, "http://localhost:3000/api/v1/admin/products");
    assert.equal(calls[1]?.method, "PATCH");
    assert.deepEqual(calls[1]?.body, { name: "Jaggery block" });
    assert.equal(String(calls[1]?.url).includes("/price"), false);
    assert.equal(calls[2]?.method, "PATCH");
    assert.equal(calls[2]?.url, `http://localhost:3000/api/v1/admin/products/${productId}/price`);
    assert.deepEqual(calls[2]?.body, { pricePaise: 6400 });
    assert.equal(calls[3]?.method, "DELETE");
    assert.equal(adminProductSchema.safeParse(created.ok ? created.data : null).success, true);
    assert.equal(adminPriceResponseSchema.safeParse(priced.ok ? priced.data : null).success, true);
  });

  it("edits catalogue fields without sending price or stock, and confirms archive", () => {
    const original = loaded();
    const unchanged = validateUpdate(original, draftFrom(original));
    assert.equal(unchanged.ok, true);
    if (unchanged.ok) {
      assert.equal(unchanged.payload, null);
    }
    const renamed = validateUpdate(original, { ...draftFrom(original), name: "Toor dal" });
    assert.equal(renamed.ok, true);
    if (renamed.ok && renamed.payload) {
      assert.deepEqual(renamed.payload, { name: "Toor dal" });
      assert.equal("pricePaise" in renamed.payload, false);
      assert.equal("openingStockQuantity" in renamed.payload, false);
    }
    const archived = validateUpdate(
      { ...original, publicationStatus: "archived" },
      { ...draftFrom(original), publicationStatus: "published" },
    );
    assert.equal(archived.ok, true);
    if (archived.ok) {
      assert.equal(archived.payload, null);
    }
    assert.equal(archiveConfirmed(null, true), null);
    assert.equal(archiveConfirmed({ productId, name: "Toor Dal" }, false), null);
    assert.equal(archiveConfirmed({ productId, name: "Toor Dal" }, true), productId);
  });

  it("reports conflicts and unavailable catalogue calls without a stack trace", () => {
    const conflict = failureFromResponse(409, { error: { code: "request_error", message: "A product with that SKU already exists" } });
    assert.equal(conflict.kind, "conflict");
    assert.equal(conflict.message, "A product with that SKU already exists");
    const unavailable = failureFromResponse(503, { error: { code: "request_error", message: "Error\n    at hidden" } });
    assert.equal(unavailable.kind, "unavailable");
    assert.equal(unavailable.message.includes("hidden"), false);
    const invalid = failureFromResponse(422, { error: { code: "request_error", message: "Check the form" } });
    assert.equal(invalid.kind, "invalid");
    assert.equal(productListView({ phase: "error", message: "The product list could not be loaded." }).kind, "error");
  });
});

describe("image preview", () => {
  it("joins a safe delivery path only when an image origin is configured", () => {
    assert.equal(resolveProductImage("/catalog/dal.jpg", null), null);
    assert.equal(resolveProductImage("/catalog/dal.jpg", "https://images.example"), "https://images.example/catalog/dal.jpg");
    assert.equal(resolveProductImage("https://evil.example/dal.jpg", "https://images.example"), null);
  });
});

describe("product images", () => {
  it("sends a multipart upload with an idempotency key and shows preview when a file is chosen", async () => {
    let requested = "";
    let idempotency = "";
    let contentType = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        requested = String(url);
        idempotency = String((init?.headers as Record<string, string>)["Idempotency-Key"] ?? "");
        contentType = String((init?.headers as Record<string, string>)["content-type"] ?? "");
        assert.equal(init?.body instanceof FormData, true);
        return json(200, {
          images: [imageRow()],
          image: imageRow(),
        });
      },
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "dal.jpg", { type: "image/jpeg" });
    const result = await uploadProductImage(client, productId, {
      file,
      altText: "Toor dal",
      isPrimary: true,
      idempotencyKey: "upload-1",
    });
    assert.equal(result.ok, true);
    assert.match(requested, /\/images$/);
    assert.equal(idempotency, "upload-1");
    assert.equal(contentType.includes("application/json"), false);
    assert.equal(Boolean(file), true);
  });

  it("maps upload failure, primary selection, reorder, confirmed delete, retry, and cancel", async () => {
    const pending = imageManagerActions({ isPrimary: false, deletionStatus: "pending_delete" });
    assert.equal(pending.canEdit, false);
    assert.equal(pending.canMakePrimary, false);
    assert.equal(pending.canDelete, false);
    const failed = imageManagerActions({ isPrimary: false, deletionStatus: "failed" });
    assert.equal(failed.canRetryDeletion, true);
    assert.equal(failed.canCancelDeletion, true);
    const live = imageManagerActions({ isPrimary: false, deletionStatus: null });
    assert.equal(live.canDelete, true);
    assert.equal(live.canMakePrimary, true);

    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        const path = String(url);
        if (path.endsWith("/images") && init?.method === "POST") {
          return json(503, { error: { code: "request_error", message: "Image storage is temporarily unavailable" } });
        }
        if (path.includes("/images/order")) {
          return json(200, { images: [imageRow({ isPrimary: true }), imageRow({ id: "00000000-0000-4000-8000-000000000082", isPrimary: false })] });
        }
        if (path.endsWith("/deletion/retry") || path.endsWith("/deletion/cancel") || init?.method === "DELETE" || init?.method === "PATCH") {
          return json(200, { images: [imageRow()], deletion: path.includes("cancel") ? { status: "cancelled", imageId: imageRow().id } : undefined });
        }
        return json(500, { error: { code: "internal_error", message: "unexpected" } });
      },
    });
    const uploadFail = await uploadProductImage(client, productId, {
      file: new File([new Uint8Array([0xff, 0xd8, 0xff])], "dal.jpg", { type: "image/jpeg" }),
      altText: "",
      isPrimary: false,
      idempotencyKey: "upload-2",
    });
    assert.equal(uploadFail.ok, false);
    assert.equal(uploadFail.kind, "unavailable");
    const updated = await updateProductImage(client, productId, imageRow().id, { isPrimary: true });
    assert.equal(updated.ok, true);
    const reordered = await reorderProductImages(client, productId, [imageRow().id, "00000000-0000-4000-8000-000000000082"]);
    assert.equal(reordered.ok, true);
    const removed = await deleteProductImage(client, productId, imageRow().id);
    assert.equal(removed.ok, true);
    const retried = await retryProductImageDeletion(client, productId, imageRow().id);
    assert.equal(retried.ok, true);
    const cancelled = await cancelProductImageDeletion(client, productId, imageRow().id);
    assert.equal(cancelled.ok, true);
  });
});

function imageRow(overrides?: { id?: string; isPrimary?: boolean }) {
  return {
    id: overrides?.id ?? "00000000-0000-4000-8000-000000000081",
    deliveryPath: "/catalog/dal.jpg",
    altText: "Toor dal",
    position: 0,
    isPrimary: overrides?.isPrimary ?? true,
    deletionStatus: null,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function summary() {
  return {
    ...detail(),
    description: undefined,
    packageSize: undefined,
    attributes: undefined,
    images: undefined,
  };
}

function detail() {
  return {
    id: productId,
    name: "Toor Dal",
    brand: "Ghartak",
    sku: "DAL-TOOR-1KG",
    barcode: null,
    description: "Split pigeon peas",
    category: { id: categoryId, name: "Staples", slug: "staples" },
    unit: "kg",
    packageSize: 1,
    packageLabel: "1 kg",
    publicationStatus: "published",
    isActive: true,
    inventory: { pricePaise: 12000, stockQuantity: 40, availability: "available" },
    attributes: [{ name: "Diet", value: "Vegetarian", position: 0 }],
    images: [
      {
        id: "00000000-0000-4000-8000-000000000081",
        deliveryPath: "/catalog/dal.jpg",
        altText: "Toor dal",
        position: 0,
        isPrimary: true,
      },
    ],
  };
}

function loaded(): LoadedProduct {
  return {
    name: "Toor Dal",
    sku: "DAL-TOOR-1KG",
    categoryId,
    unit: "kg",
    packageSize: "1",
    packageLabel: "1 kg",
    brand: "Ghartak",
    barcode: "",
    description: "Split pigeon peas",
    attributes: [{ name: "Diet", value: "Vegetarian" }],
    publicationStatus: "published",
    isActive: true,
  };
}

function draftFrom(product: LoadedProduct) {
  return {
    ...emptyProductDraft(),
    ...product,
    priceRupees: "120",
    openingStock: "40",
  };
}

describe("product form save feedback", () => {
  const ready = {
    ...emptyProductDraft(),
    name: "Face wash",
    sku: "FACE-WASH",
    categoryId: "10000000-0000-4000-8000-000000000021",
    unit: "piece",
    packageSize: "1",
    packageLabel: "1 piece",
    priceRupees: "100",
  };

  it("reports a letter barcode on the barcode field and in the summary", () => {
    const result = validateCreate({ ...ready, barcode: "ABC-abc-1234" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors), ["barcode"]);
      assert.equal(errorSummary(result.errors), "Product not saved. Use 8 to 14 digits, or leave the barcode empty.");
    }
  });

  it("puts duplicate attribute errors on a row the form renders", () => {
    const result = validateCreate({ ...ready, attributes: [{ name: "Size", value: "S" }, { name: "Size", value: "M" }] });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(Object.keys(result.errors).every((key) => key === "attributes" || /^attributes\.\d+$/.test(key)), Object.keys(result.errors).join());
    }
  });

  it("counts several problems in the summary", () => {
    assert.equal(errorSummary({ name: "a", sku: "b" }), "Product not saved. Fix the 2 problems marked in red.");
  });
});
