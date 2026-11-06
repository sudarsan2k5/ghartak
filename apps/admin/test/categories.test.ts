import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminCategoryListResponseSchema, adminCategorySchema } from "@ghartak/contracts";
import { createApiClient, failureFromResponse } from "../src/lib/api/client";
import { redirectForFailure } from "../src/lib/auth/session";
import {
  assignableCategories,
  categoryListView,
  categoryOptionLabel,
  deleteIntent,
  emptyCategoryDraft,
  filterCategories,
  validateCreate,
  validateUpdate,
} from "../src/lib/categories/form";
import { createCategory, deleteCategory, updateCategory } from "../src/lib/categories/requests";

const categoryId = "00000000-0000-4000-8000-000000000021";

const sample = {
  id: categoryId,
  name: "Staples",
  slug: "staples",
  description: "Grains and pulses",
  isActive: true,
  productCount: 2,
};

describe("category list", () => {
  it("filters the returned list and describes loading, empty, and error views", () => {
    const categories = [
      sample,
      { ...sample, id: "00000000-0000-4000-8000-000000000022", name: "Dairy", slug: "dairy", description: null, isActive: false, productCount: 1 },
    ];
    assert.deepEqual(
      filterCategories(categories, "grain", "").map((category) => category.slug),
      ["staples"],
    );
    assert.deepEqual(
      filterCategories(categories, "", "inactive").map((category) => category.slug),
      ["dairy"],
    );
    assert.equal(categoryListView({ phase: "loading" }).kind, "loading");
    assert.equal(categoryListView({ phase: "error", message: "Categories could not be loaded." }).kind, "error");
    assert.equal(categoryListView({ phase: "ready", count: 0 }).kind, "empty");
    assert.equal(categoryListView({ phase: "ready", count: 2 }).kind, "ready");
  });

  it("loads every category and sends an expired session to login", async () => {
    let requested = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        requested = String(url);
        assert.equal(init?.credentials, "include");
        return json(200, { categories: [sample] });
      },
    });
    const result = await client.get("/api/v1/admin/categories", adminCategoryListResponseSchema);
    assert.equal(result.ok, true);
    assert.equal(requested, "http://localhost:3000/api/v1/admin/categories");
    assert.equal(redirectForFailure(failureFromResponse(401, { error: { code: "request_error", message: "Authentication required" } })), "/login");
    assert.equal(redirectForFailure(failureFromResponse(403, { error: { code: "request_error", message: "You do not have access to this resource" } })), "/login");
  });
});

describe("category mutations", () => {
  it("rejects an incomplete category and omits a blank slug", () => {
    const missing = validateCreate(emptyCategoryDraft());
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.errors["name"], "Enter a category name.");
    }
    const slug = validateCreate({ ...emptyCategoryDraft(), name: "Spices", slug: "Spices" });
    assert.equal(slug.ok, false);
    if (!slug.ok) {
      assert.equal(slug.errors["slug"], "Use lowercase letters, numbers, and single hyphens.");
    }
    const ready = validateCreate({ ...emptyCategoryDraft(), name: "Spices", description: "Whole spices" });
    assert.equal(ready.ok, true);
    if (ready.ok) {
      assert.deepEqual(ready.payload, { name: "Spices", description: "Whole spices", isActive: true });
      assert.equal("slug" in ready.payload, false);
    }
  });

  it("creates a category once with credentials", async () => {
    let calls = 0;
    let body = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        calls += 1;
        body = String(init?.body);
        assert.equal(init?.method, "POST");
        assert.equal(init?.credentials, "include");
        assert.equal(url, "http://localhost:3000/api/v1/admin/categories");
        return json(201, { ...sample, name: "Spices", slug: "spices", description: null, productCount: 0 });
      },
    });
    const built = validateCreate({ name: "Spices", slug: "", description: "", isActive: false });
    assert.equal(built.ok, true);
    if (!built.ok) {
      return;
    }
    const result = await createCategory(client, built.payload);
    assert.equal(calls, 1);
    assert.equal(body, JSON.stringify({ name: "Spices", isActive: false }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(adminCategorySchema.safeParse(result.data).success, true);
    }
  });

  it("saves only changed fields and can deactivate", () => {
    const original = { name: "Staples", slug: "staples", description: "Grains and pulses", isActive: true };
    const unchanged = validateUpdate(original, { ...original, description: "Grains and pulses" });
    assert.equal(unchanged.ok, true);
    if (unchanged.ok) {
      assert.equal(unchanged.payload, null);
    }
    const renamed = validateUpdate(original, { ...original, description: "Grains and pulses", name: "Grocery staples" });
    assert.equal(renamed.ok, true);
    if (renamed.ok) {
      assert.deepEqual(renamed.payload, { name: "Grocery staples" });
    }
    const deactivated = validateUpdate(original, { ...original, description: "Grains and pulses", isActive: false });
    assert.equal(deactivated.ok, true);
    if (deactivated.ok) {
      assert.deepEqual(deactivated.payload, { isActive: false });
    }
  });

  it("patches activation through the category endpoint", async () => {
    let body = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        body = String(init?.body);
        assert.equal(init?.method, "PATCH");
        assert.equal(init?.credentials, "include");
        assert.match(String(url), new RegExp(`/api/v1/admin/categories/${categoryId}$`));
        return json(200, { ...sample, isActive: false });
      },
    });
    const result = await updateCategory(client, categoryId, { isActive: false });
    assert.equal(body, JSON.stringify({ isActive: false }));
    assert.equal(result.ok, true);
  });

  it("asks for confirmation before deleting an empty category", () => {
    assert.equal(deleteIntent({ productCount: 0, isActive: true }), "confirm-delete");
    assert.equal(deleteIntent({ productCount: 2, isActive: true }), "offer-deactivate");
    assert.equal(deleteIntent({ productCount: 2, isActive: false }), "blocked");
  });

  it("reports a 409 without deleting products or retrying", async () => {
    let calls = 0;
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        calls += 1;
        assert.equal(init?.method, "DELETE");
        assert.equal(init?.credentials, "include");
        assert.match(String(url), new RegExp(`/api/v1/admin/categories/${categoryId}$`));
        return json(409, { error: { code: "request_error", message: "Reassign or remove this category's products before deleting it" } });
      },
    });
    const result = await deleteCategory(client, categoryId);
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "conflict");
      assert.match(result.message, /products/);
    }
    const invalid = failureFromResponse(422, { error: { code: "request_error", message: "The request could not be completed." } });
    assert.equal(invalid.kind, "invalid");
  });
});

describe("product category selector", () => {
  it("offers active categories and keeps the current inactive category", () => {
    const categories = [
      { id: "active", name: "Produce", isActive: true },
      { id: "retired", name: "Seasonal", isActive: false },
    ];
    assert.deepEqual(
      assignableCategories(categories).map((category) => category.id),
      ["active"],
    );
    const editing = assignableCategories(categories, "retired");
    assert.deepEqual(
      editing.map((category) => category.id),
      ["active", "retired"],
    );
    assert.equal(categoryOptionLabel(editing[1]!), "Seasonal (inactive)");
    assert.equal(editing[1]?.id, "retired");
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
