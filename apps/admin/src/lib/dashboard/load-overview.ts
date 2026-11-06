import { adminCategoryListResponseSchema, adminProductListResponseSchema } from "@ghartak/contracts";
import type { ApiClient } from "../api/client";
import { canScanStock, stockSummary, type AdminProductSummary, type OverviewData } from "./metrics";

export async function loadOverview(
  client: ApiClient,
): Promise<{ ok: true; data: OverviewData } | { ok: false; kind: "auth" | "error"; message: string }> {
  const [all, published, draft, archived, categories, firstPage] = await Promise.all([
    client.get("/api/v1/admin/products?limit=1", adminProductListResponseSchema),
    client.get("/api/v1/admin/products?limit=1&publicationStatus=published", adminProductListResponseSchema),
    client.get("/api/v1/admin/products?limit=1&publicationStatus=draft", adminProductListResponseSchema),
    client.get("/api/v1/admin/products?limit=1&publicationStatus=archived", adminProductListResponseSchema),
    client.get("/api/v1/admin/categories", adminCategoryListResponseSchema),
    client.get("/api/v1/admin/products?limit=8", adminProductListResponseSchema),
  ]);

  const results = [all, published, draft, archived, categories, firstPage];
  const failed = results.find((result) => !result.ok);
  if (failed && !failed.ok) {
    if (failed.kind === "unauthorized" || failed.kind === "forbidden") {
      return { ok: false, kind: "auth", message: failed.message };
    }
    return { ok: false, kind: "error", message: "The catalogue could not be loaded." };
  }
  if (!all.ok || !published.ok || !draft.ok || !archived.ok || !categories.ok || !firstPage.ok) {
    return { ok: false, kind: "error", message: "The catalogue could not be loaded." };
  }

  const total = all.data.pagination.total;
  let scanned: AdminProductSummary[] = [];
  if (canScanStock(total) && total > 0) {
    const pageCount = Math.ceil(total / 50);
    const pages = await loadRemainingPages(client, pageCount);
    if (!pages.ok) {
      return pages;
    }
    scanned = pages.products;
  }

  return {
    ok: true,
    data: {
      total,
      published: published.data.pagination.total,
      draft: draft.data.pagination.total,
      archived: archived.data.pagination.total,
      categoryCount: categories.data.categories.length,
      products: firstPage.data.products,
      stock: stockSummary(total, canScanStock(total) ? scanned : []),
    },
  };
}

async function loadRemainingPages(
  client: ApiClient,
  pageCount: number,
): Promise<{ ok: true; products: AdminProductSummary[] } | { ok: false; kind: "auth" | "error"; message: string }> {
  const products: AdminProductSummary[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const result = await client.get(`/api/v1/admin/products?limit=50&page=${page}`, adminProductListResponseSchema);
    if (!result.ok) {
      return { ok: false, kind: result.kind === "unauthorized" || result.kind === "forbidden" ? "auth" : "error", message: "The catalogue could not be loaded." };
    }
    products.push(...result.data.products);
  }
  return { ok: true, products };
}
