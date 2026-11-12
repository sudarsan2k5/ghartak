import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminProductListResponseSchema, adminSessionResponseSchema } from "@ghartak/contracts";
import { createApiClient, failureFromResponse } from "../src/lib/api/client";
import { resolveApiBaseUrl } from "../src/lib/api/config";
import { loginErrorMessage, loginFieldErrors } from "../src/lib/auth/login";
import { dashboardRedirect, endSession, loginRedirect, restoreSession, statusFromResult } from "../src/lib/auth/session";
import { loadOverview } from "../src/lib/dashboard/load-overview";
import { canScanStock, overviewView, stockScanLimit, stockSummary, type AdminProductSummary } from "../src/lib/dashboard/metrics";

const password = "correct-horse-battery";
const productId = "00000000-0000-4000-8000-000000000031";
const categoryId = "00000000-0000-4000-8000-000000000021";

describe("admin API client", () => {
  it("sends credentials and does not attach a bearer token", async () => {
    let init: RequestInit | undefined;
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (_url, options) => {
        init = options;
        return jsonResponse(200, emptyList(0));
      },
    });
    const result = await client.get("/api/v1/admin/products?limit=1", adminProductListResponseSchema);
    assert.equal(result.ok, true);
    assert.equal(init?.credentials, "include");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), null);
  });

  it("maps 401, 403, 429, 503, and network failures without returning the password", async () => {
    const unauthorized = await requestStatus(401, { error: { code: "request_error", message: "Email or password is incorrect" } });
    assert.equal(unauthorized.ok, false);
    if (!unauthorized.ok) {
      assert.equal(unauthorized.kind, "unauthorized");
      assert.equal(loginErrorMessage(unauthorized), "Email or password is incorrect");
      assert.equal(unauthorized.message.includes(password), false);
    }

    const forbidden = failureFromResponse(403, { error: { code: "request_error", message: "This origin is not allowed" } });
    assert.equal(forbidden.kind, "forbidden");
    assert.equal(loginErrorMessage(forbidden), "This dashboard is not allowed to sign in from this address.");

    const limited = failureFromResponse(429, { error: { code: "request_error", message: "Too many sign-in attempts. Try again later." } });
    assert.equal(limited.kind, "rate_limited");
    assert.equal(loginErrorMessage(limited), "Too many sign-in attempts. Try again later.");

    const unavailable = failureFromResponse(503, { error: { code: "request_error", message: "stack\ntrace" } });
    assert.equal(unavailable.kind, "unavailable");
    assert.equal(unavailable.message.includes("stack"), false);
    assert.equal(loginErrorMessage(unavailable), "The admin service is temporarily unavailable.");

    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => {
        throw new Error(`down ${password}`);
      },
    });
    const network = await client.post("/api/v1/admin/session", adminSessionResponseSchema, {
      email: "admin@example.com",
      password,
    });
    assert.equal(network.ok, false);
    if (!network.ok) {
      assert.equal(network.kind, "network");
      assert.equal(network.message.includes(password), false);
    }
  });

  it("rejects a success payload that does not match the contract", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3000/",
      fetchImpl: async () => jsonResponse(200, { token: password }),
    });
    const result = await client.post("/api/v1/admin/session", adminSessionResponseSchema, {
      email: "admin@example.com",
      password,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "unexpected");
      assert.equal(result.message.includes(password), false);
    }
  });
});

describe("admin sign-in and session", () => {
  it("validates email and password before a request", () => {
    const errors = loginFieldErrors({ email: "not-an-email", password: "short" });
    assert.equal(errors.email, "Enter a valid email address.");
    assert.equal(errors.password, "Use 12 to 128 characters.");
    assert.deepEqual(loginFieldErrors({ email: "admin@example.com", password }), {});
  });

  it("restores a session from a protected catalogue request", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => jsonResponse(200, emptyList(1)),
    });
    assert.equal(await restoreSession(client), "authenticated");
    assert.equal(statusFromResult({ ok: false, status: 401, kind: "unauthorized", message: "Authentication required" }), "anonymous");
    assert.equal(statusFromResult({ ok: false, status: 403, kind: "forbidden", message: "You do not have access to this resource" }), "forbidden");
    assert.equal(statusFromResult({ ok: false, status: 503, kind: "unavailable", message: "The admin service is temporarily unavailable." }), "unavailable");
  });

  it("sends logout to the admin session endpoint", async () => {
    let path = "";
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url, init) => {
        path = String(url);
        assert.equal(init?.method, "POST");
        assert.equal(init?.credentials, "include");
        return new Response(null, { status: 204 });
      },
    });
    const result = await endSession(client);
    assert.equal(result.ok, true);
    assert.equal(path, "http://localhost:3000/api/v1/admin/logout");
  });

  it("sends anonymous and forbidden visitors to login, and signed-in visitors to the overview", () => {
    assert.equal(dashboardRedirect("anonymous"), "/login");
    assert.equal(dashboardRedirect("forbidden"), "/login");
    assert.equal(dashboardRedirect("authenticated"), null);
    assert.equal(dashboardRedirect("unavailable"), null);
    assert.equal(loginRedirect("authenticated"), "/overview");
    assert.equal(loginRedirect("anonymous"), null);
  });
});

describe("dashboard overview", () => {
  it("describes loading, empty, error, and ready views", () => {
    assert.equal(overviewView({ phase: "loading" }).kind, "loading");
    assert.deepEqual(overviewView({ phase: "error", message: "The catalogue could not be loaded." }), {
      kind: "error",
      message: "The catalogue could not be loaded.",
    });
    const empty = overviewData({ total: 0 });
    assert.equal(overviewView({ phase: "ready", data: empty }).kind, "empty");
    assert.equal(overviewView({ phase: "ready", data: overviewData({ total: 2 }) }).kind, "ready");
  });

  it("counts out-of-stock products only when the full catalogue can be read", () => {
    const products = [
      sampleProduct({ stockQuantity: 0, availability: "out_of_stock" }),
      sampleProduct({ id: "00000000-0000-4000-8000-000000000032", name: "Milk", stockQuantity: 4, availability: "available" }),
    ];
    const counted = stockSummary(products.length, products);
    assert.equal(counted.status, "counted");
    if (counted.status === "counted") {
      assert.equal(counted.outOfStock, 1);
      assert.equal(counted.attention.length, 1);
    }
    assert.equal(canScanStock(stockScanLimit), true);
    const skipped = stockSummary(stockScanLimit + 1, products);
    assert.equal(skipped.status, "unavailable");
  });

  it("loads publication totals and leaves stock uncounted when the catalogue is too large", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async (url) => {
        const path = String(url);
        if (path.endsWith("/api/v1/admin/categories")) {
          return jsonResponse(200, { categories: [] });
        }
        if (path.includes("publicationStatus=published")) {
          return jsonResponse(200, emptyList(3));
        }
        if (path.includes("publicationStatus=draft")) {
          return jsonResponse(200, emptyList(1));
        }
        if (path.includes("publicationStatus=archived")) {
          return jsonResponse(200, emptyList(0));
        }
        return jsonResponse(200, emptyList(stockScanLimit + 1));
      },
    });
    const result = await loadOverview(client);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.total, stockScanLimit + 1);
      assert.equal(result.data.published, 3);
      assert.equal(result.data.draft, 1);
      assert.equal(result.data.archived, 0);
      assert.equal(result.data.categoryCount, 0);
      assert.equal(result.data.stock.status, "unavailable");
    }
  });

  it("returns an error view source when the catalogue request fails", async () => {
    const client = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => jsonResponse(503, { error: { code: "request_error", message: "Sign-in is temporarily unavailable" } }),
    });
    const result = await loadOverview(client);
    assert.deepEqual(result, { ok: false, kind: "error", message: "The catalogue could not be loaded." });
    const expired = createApiClient({
      baseUrl: "http://localhost:3000",
      fetchImpl: async () => jsonResponse(401, { error: { code: "request_error", message: "Authentication required" } }),
    });
    assert.deepEqual(await loadOverview(expired), { ok: false, kind: "auth", message: "Authentication required" });
    assert.equal(overviewView({ phase: "error", message: "The catalogue could not be loaded." }).kind, "error");
  });
});

describe("API base URL", () => {
  it("defaults to localhost only outside production and rejects a loopback production URL", () => {
    assert.equal(resolveApiBaseUrl(undefined, "development"), "http://localhost:3000");
    assert.throws(() => resolveApiBaseUrl(undefined, "production"), /required in production/);
    assert.throws(() => resolveApiBaseUrl("http://127.0.0.1:3000", "production"), /loopback/);
    assert.throws(() => resolveApiBaseUrl("http://localhost:3000/api", "development"), /without credentials or a path/);
    assert.equal(resolveApiBaseUrl("https://api.example", "production"), "https://api.example");
  });
});

function requestStatus(status: number, body: unknown) {
  const client = createApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () => jsonResponse(status, body),
  });
  return client.post("/api/v1/admin/session", adminSessionResponseSchema, {
    email: "admin@example.com",
    password,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyList(total: number) {
  return {
    products: [],
    pagination: { page: 1, limit: 1, total, pageCount: total === 0 ? 0 : 1 },
  };
}

function overviewData(input: { total: number }) {
  return {
    total: input.total,
    published: 0,
    draft: 0,
    archived: 0,
    categoryCount: 0,
    products: [],
    stock: stockSummary(input.total, []),
  };
}

function sampleProduct(input: {
  id?: string;
  name?: string;
  stockQuantity: number;
  availability: AdminProductSummary["inventory"]["availability"];
}): AdminProductSummary {
  return {
    id: input.id ?? productId,
    name: input.name ?? "Toor Dal",
    brand: null,
    category: { id: categoryId, name: "Staples", slug: "staples" },
    packageLabel: "1 kg",
    publicationStatus: "published",
    isActive: true,
    primaryImagePath: null,
    inventory: { pricePaise: 12000, mrpPaise: null, stockQuantity: input.stockQuantity, availability: input.availability },
  };
}
