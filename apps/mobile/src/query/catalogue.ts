import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

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

export function useProductCatalogue(params: Omit<ProductListParams, "page"> & { enabled?: boolean }) {
  const { enabled = true, ...filters } = params;
  return useInfiniteQuery({
    queryKey: catalogueKeys.products(filters),
    queryFn: ({ pageParam, signal }) => listProducts({ ...filters, page: pageParam, limit: filters.limit ?? 20 }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.pageCount ? lastPage.pagination.page + 1 : undefined,
    staleTime: staleTimeMs,
    retry: 1,
    enabled,
  });
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
