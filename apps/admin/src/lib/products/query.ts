import { adminProductListQuerySchema, type AdminProductListQuery } from "@ghartak/contracts";

export const productPageSize = 20;

export type ProductListFilters = {
  page: number;
  search: string;
  publicationStatus: "" | "draft" | "published" | "archived";
  categoryId: string;
};

export function filtersFromSearchParams(params: URLSearchParams): ProductListFilters {
  const page = Number(params.get("page") ?? "1");
  const status = params.get("status");
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    search: params.get("q") ?? "",
    publicationStatus: status === "draft" || status === "published" || status === "archived" ? status : "",
    categoryId: params.get("category") ?? "",
  };
}

export function productListPath(filters: ProductListFilters): string {
  const query = new URLSearchParams();
  query.set("page", String(filters.page));
  query.set("limit", String(productPageSize));
  const search = filters.search.trim();
  if (search.length > 0) {
    query.set("search", search);
  }
  if (filters.publicationStatus) {
    query.set("publicationStatus", filters.publicationStatus);
  }
  if (filters.categoryId) {
    query.set("categoryId", filters.categoryId);
  }
  return `/api/v1/admin/products?${query.toString()}`;
}

export function parseProductListQuery(filters: ProductListFilters): AdminProductListQuery {
  return adminProductListQuerySchema.parse({
    page: filters.page,
    limit: productPageSize,
    search: filters.search.trim() || undefined,
    publicationStatus: filters.publicationStatus || undefined,
    categoryId: filters.categoryId || undefined,
  });
}
