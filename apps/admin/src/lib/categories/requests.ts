import { adminCategorySchema, type AdminCategoryCreate, type AdminCategoryUpdate } from "@ghartak/contracts";
import type { ApiClient } from "../api/client";

export function createCategory(client: ApiClient, body: AdminCategoryCreate) {
  return client.post("/api/v1/admin/categories", adminCategorySchema, body);
}

export function updateCategory(client: ApiClient, categoryId: string, body: AdminCategoryUpdate) {
  return client.patch(`/api/v1/admin/categories/${categoryId}`, adminCategorySchema, body);
}

export function deleteCategory(client: ApiClient, categoryId: string) {
  return client.delete(`/api/v1/admin/categories/${categoryId}`, null);
}
