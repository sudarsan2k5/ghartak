import { infiniteQueryOptions, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";

import { getProduct, listCategories, listDailyTiles, listProducts, type ProductListParams } from "@/api/client";

const staleTimeMs = 60_000;

export const catalogueKeys = {
  categories: ["catalogue", "categories"] as const,
  dailyTiles: ["catalogue", "daily-tiles"] as const,
  products: (params: ProductListParams) => ["catalogue", "products", params] as const,
  product: (productId: string) => ["catalogue", "product", productId] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: catalogueKeys.categories,
    queryFn: ({ signal }) => listCategories(signal),
    staleTime: staleTimeMs,
    retry: 1,
  });
}

export function useDailyTiles() {
  return useQuery({
    queryKey: catalogueKeys.dailyTiles,
    queryFn: ({ signal }) => listDailyTiles(signal),
    staleTime: staleTimeMs,
    retry: 1,
  });
}

/** One definition for product lists, so screens and background prefetches share a cache entry. */
function productListOptions(filters: Omit<ProductListParams, "page">) {
  return infiniteQueryOptions({
    queryKey: catalogueKeys.products(filters),
    queryFn: ({ pageParam, signal }) => listProducts({ ...filters, page: pageParam, limit: filters.limit ?? 20 }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.pageCount ? lastPage.pagination.page + 1 : undefined,
    staleTime: staleTimeMs,
    retry: 1,
  });
}

export function useProductCatalogue(params: Omit<ProductListParams, "page"> & { enabled?: boolean }) {
  const { enabled = true, ...filters } = params;
  return useInfiniteQuery({ ...productListOptions(filters), enabled });
}

/** The filters a category opens with. Prefetches must match them exactly to be reused. */
export function categoryOpeningFilters(categoryId: string): Omit<ProductListParams, "page"> {
  return { limit: 20, categoryId, sort: "name" };
}

/**
 * Loads the first page of each category in the background so switching categories shows
 * products straight away. Fresh cache entries are left alone, so this is cheap to repeat.
 */
export function prefetchCategoryProducts(queryClient: QueryClient, categoryIds: readonly string[]): void {
  for (const id of categoryIds) {
    void queryClient.prefetchInfiniteQuery(productListOptions(categoryOpeningFilters(id)));
  }
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: catalogueKeys.product(productId),
    queryFn: ({ signal }) => getProduct(productId, signal),
    staleTime: staleTimeMs,
    retry: 1,
    enabled: productId.length > 0,
  });
}
