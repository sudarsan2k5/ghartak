import {
  adminCategoryListResponseSchema,
  adminImageListResponseSchema,
  adminImageUpdateSchema,
  adminPriceResponseSchema,
  adminProductListResponseSchema,
  adminProductSchema,
} from "@ghartak/contracts";
import type { ApiClient } from "../api/client";
import type { ProductListFilters } from "./query";
import { productListPath } from "./query";

export function fetchProductPage(client: ApiClient, filters: ProductListFilters) {
  return client.get(productListPath(filters), adminProductListResponseSchema);
}

export function fetchCategories(client: ApiClient) {
  return client.get("/api/v1/admin/categories", adminCategoryListResponseSchema);
}

export function fetchProduct(client: ApiClient, productId: string) {
  return client.get(`/api/v1/admin/products/${productId}`, adminProductSchema);
}

export function createProduct(client: ApiClient, body: unknown) {
  return client.post("/api/v1/admin/products", adminProductSchema, body);
}

export function updateProduct(client: ApiClient, productId: string, body: unknown) {
  return client.patch(`/api/v1/admin/products/${productId}`, adminProductSchema, body);
}

export function archiveProduct(client: ApiClient, productId: string) {
  return client.delete(`/api/v1/admin/products/${productId}`, adminProductSchema);
}

export function updateProductPrice(client: ApiClient, productId: string, pricePaise: number) {
  return client.patch(`/api/v1/admin/products/${productId}/price`, adminPriceResponseSchema, { pricePaise });
}

export function uploadProductImage(
  client: ApiClient,
  productId: string,
  input: { file: File; altText: string; isPrimary: boolean; idempotencyKey: string },
) {
  const body = new FormData();
  body.append("file", input.file);
  if (input.altText.trim().length > 0) {
    body.append("altText", input.altText.trim());
  }
  body.append("isPrimary", input.isPrimary ? "true" : "false");
  return client.postForm(`/api/v1/admin/products/${productId}/images`, adminImageListResponseSchema, body, {
    "Idempotency-Key": input.idempotencyKey,
  });
}

export function updateProductImage(
  client: ApiClient,
  productId: string,
  imageId: string,
  body: { altText?: string | null; isPrimary?: boolean },
) {
  return client.patch(
    `/api/v1/admin/products/${productId}/images/${imageId}`,
    adminImageListResponseSchema,
    adminImageUpdateSchema.parse(body),
  );
}

export function reorderProductImages(client: ApiClient, productId: string, imageIds: string[]) {
  return client.put(`/api/v1/admin/products/${productId}/images/order`, adminImageListResponseSchema, { imageIds });
}

export function deleteProductImage(client: ApiClient, productId: string, imageId: string) {
  return client.delete(`/api/v1/admin/products/${productId}/images/${imageId}`, adminImageListResponseSchema);
}

export function retryProductImageDeletion(client: ApiClient, productId: string, imageId: string) {
  return client.post(`/api/v1/admin/products/${productId}/images/${imageId}/deletion/retry`, adminImageListResponseSchema);
}

export function cancelProductImageDeletion(client: ApiClient, productId: string, imageId: string) {
  return client.post(`/api/v1/admin/products/${productId}/images/${imageId}/deletion/cancel`, adminImageListResponseSchema);
}
