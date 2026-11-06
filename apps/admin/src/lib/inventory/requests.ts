import { adminStockResponseSchema } from "@ghartak/contracts";
import type { ApiClient } from "../api/client";
import type { AdminStockChange } from "@ghartak/contracts";

export function changeStock(client: ApiClient, productId: string, body: AdminStockChange) {
  return client.post(`/api/v1/admin/products/${productId}/stock`, adminStockResponseSchema, body);
}
