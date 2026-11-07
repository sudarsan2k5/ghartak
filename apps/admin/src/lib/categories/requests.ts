import { adminCategoryListResponseSchema, adminCategorySchema, adminDailyTileListResponseSchema, adminDailyTileSchema, type AdminCategoryCreate, type AdminCategoryUpdate, type AdminDailyTileUpdate } from "@ghartak/contracts";
import type { ApiClient } from "../api/client";

export function reorderCategories(client: ApiClient, categoryIds: string[]) {
  return client.put("/api/v1/admin/categories/order", adminCategoryListResponseSchema, { categoryIds });
}

export function createCategory(client: ApiClient, body: AdminCategoryCreate) {
  return client.post("/api/v1/admin/categories", adminCategorySchema, body);
}

export function updateCategory(client: ApiClient, categoryId: string, body: AdminCategoryUpdate) {
  return client.patch(`/api/v1/admin/categories/${categoryId}`, adminCategorySchema, body);
}

export function deleteCategory(client: ApiClient, categoryId: string) {
  return client.delete(`/api/v1/admin/categories/${categoryId}`, null);
}

function imageForm(file: File): FormData {
  const body = new FormData();
  body.append("file", file);
  return body;
}

export function uploadCategoryImage(client: ApiClient, categoryId: string, file: File) {
  return client.postForm(`/api/v1/admin/categories/${categoryId}/image`, adminCategorySchema, imageForm(file));
}

export function removeCategoryImage(client: ApiClient, categoryId: string) {
  return client.delete(`/api/v1/admin/categories/${categoryId}/image`, adminCategorySchema);
}

export function fetchDailyTiles(client: ApiClient) {
  return client.get("/api/v1/admin/daily-tiles", adminDailyTileListResponseSchema);
}

export function updateDailyTile(client: ApiClient, position: number, body: AdminDailyTileUpdate) {
  return client.patch(`/api/v1/admin/daily-tiles/${position}`, adminDailyTileSchema, body);
}

export function uploadDailyTileImage(client: ApiClient, position: number, file: File) {
  return client.postForm(`/api/v1/admin/daily-tiles/${position}/image`, adminDailyTileSchema, imageForm(file));
}

export function removeDailyTileImage(client: ApiClient, position: number) {
  return client.delete(`/api/v1/admin/daily-tiles/${position}/image`, adminDailyTileSchema);
}
