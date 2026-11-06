import { getApiBaseUrl } from "@/api/client";
import { getCustomerOrderStatus, type OrderStatusResult } from "@/api/order-status";

export type { OrderStatusFailure, OrderStatusResult } from "@/api/order-status";

export async function fetchCustomerOrderStatus(
  token: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<OrderStatusResult> {
  return getCustomerOrderStatus(token, { baseUrl: getApiBaseUrl(), fetchImpl, signal });
}
