import {
  adminOrderCancelSchema,
  adminOrderDetailSchema,
  adminOrderListResponseSchema,
  adminOrderStatusUpdateSchema,
  adminOrderSummarySchema,
  type AdminOrderAdvanceStatus,
} from "@ghartak/contracts";
import type { ApiClient } from "../api/client";
import { orderListPath, type OrderListFilters } from "./query";

export function fetchOrderPage(client: ApiClient, filters: OrderListFilters) {
  return client.get(orderListPath(filters), adminOrderListResponseSchema);
}

export function fetchOrderSummary(client: ApiClient) {
  return client.get("/api/v1/admin/orders/summary", adminOrderSummarySchema);
}

export function fetchOrder(client: ApiClient, orderId: string) {
  return client.get(`/api/v1/admin/orders/${orderId}`, adminOrderDetailSchema);
}

export function updateOrderStatus(client: ApiClient, orderId: string, status: AdminOrderAdvanceStatus) {
  const body = adminOrderStatusUpdateSchema.parse({ status });
  return client.patch(`/api/v1/admin/orders/${orderId}/status`, adminOrderDetailSchema, body);
}

export function cancelOrder(client: ApiClient, orderId: string, reason: string) {
  const body = adminOrderCancelSchema.parse({ reason });
  return client.post(`/api/v1/admin/orders/${orderId}/cancel`, adminOrderDetailSchema, body);
}
