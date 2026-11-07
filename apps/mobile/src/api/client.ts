import {
  categoryListResponseSchema,
  dailyTileListResponseSchema,
  productDetailResponseSchema,
  productListResponseSchema,
  type CatalogueProductSort,
  type CategoryListResponse,
  type DailyTileListResponse,
  type ProductDetailResponse,
  type ProductListResponse,
} from "@ghartak/contracts";
import { Platform } from "react-native";

import { apiBaseUrl, type ApiPlatform } from "@/api/config";

const requestTimeoutMs = 8000;

export class CatalogueRequestError extends Error {
  readonly kind: "network" | "timeout" | "http" | "invalid";

  constructor(kind: CatalogueRequestError["kind"], message: string) {
    super(message);
    this.name = "CatalogueRequestError";
    this.kind = kind;
  }
}

export type ProductListParams = {
  page?: number;
  limit?: number;
  categoryId?: string;
  search?: string;
  inStock?: boolean;
  sort?: CatalogueProductSort;
};

export function getApiBaseUrl(): string {
  const platform: ApiPlatform =
    Platform.OS === "android" ? "android" : Platform.OS === "web" ? "web" : "ios";
  return apiBaseUrl({
    configured: process.env.EXPO_PUBLIC_API_BASE_URL,
    platform,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  });
}

export async function listCategories(signal?: AbortSignal): Promise<CategoryListResponse> {
  return request("/api/v1/categories", categoryListResponseSchema, signal);
}

export async function listDailyTiles(signal?: AbortSignal): Promise<DailyTileListResponse> {
  return request("/api/v1/home/daily-tiles", dailyTileListResponseSchema, signal);
}

export async function listProducts(
  params: ProductListParams,
  signal?: AbortSignal,
): Promise<ProductListResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.categoryId) {
    search.set("categoryId", params.categoryId);
  }
  if (params.search) {
    search.set("search", params.search);
  }
  if (params.inStock) {
    search.set("inStock", "true");
  }
  if (params.sort) {
    search.set("sort", params.sort);
  }
  const query = search.toString();
  return request(`/api/v1/products${query ? `?${query}` : ""}`, productListResponseSchema, signal);
}

export async function getProduct(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductDetailResponse | null> {
  try {
    return await request(`/api/v1/products/${encodeURIComponent(productId)}`, productDetailResponseSchema, signal);
  } catch (error) {
    if (error instanceof CatalogueRequestError && error.kind === "http" && error.message === "not_found") {
      return null;
    }
    throw error;
  }
}

async function request<T>(path: string, schema: { parse: (value: unknown) => T }, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new CatalogueRequestError("timeout", "The catalogue request timed out"));
  }, requestTimeoutMs);
  const onAbort = () => {
    controller.abort(signal?.reason);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new CatalogueRequestError("http", "not_found");
    }
    if (!response.ok) {
      throw new CatalogueRequestError("http", "The catalogue request was rejected");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CatalogueRequestError("invalid", "The catalogue response was not valid");
    }
    try {
      return schema.parse(body);
    } catch {
      throw new CatalogueRequestError("invalid", "The catalogue response was not valid");
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error instanceof Error ? error : new CatalogueRequestError("network", "The catalogue request was cancelled");
    }
    if (error instanceof CatalogueRequestError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new CatalogueRequestError("timeout", "The catalogue request timed out");
    }
    throw new CatalogueRequestError("network", "Ghartak is unreachable right now");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
