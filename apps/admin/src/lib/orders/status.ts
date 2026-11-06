import type { AdminOrderAdvanceStatus, OrderStatus } from "@ghartak/contracts";
import { adminOrderAdvanceStatusSchema } from "@ghartak/contracts";

const nextByStatus: Record<OrderStatus, AdminOrderAdvanceStatus | null> = {
  placed: "confirmed",
  confirmed: "packed",
  packed: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null,
  cancelled: null,
};

const labels: Record<OrderStatus, string> = {
  placed: "New",
  confirmed: "Confirmed",
  packed: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const actionLabels: Record<AdminOrderAdvanceStatus, string> = {
  confirmed: "Confirm order",
  packed: "Mark preparing",
  out_for_delivery: "Send out for delivery",
  delivered: "Mark delivered",
};

export function orderStatusLabel(status: OrderStatus): string {
  return labels[status];
}

export function nextOrderStatus(status: OrderStatus): AdminOrderAdvanceStatus | null {
  return nextByStatus[status];
}

export function nextOrderActionLabel(status: OrderStatus): string | null {
  const next = nextOrderStatus(status);
  return next ? actionLabels[next] : null;
}

export function canCancelOrder(status: OrderStatus): boolean {
  return status !== "delivered" && status !== "cancelled";
}

export function parseAdvanceStatus(value: string): AdminOrderAdvanceStatus | null {
  const parsed = adminOrderAdvanceStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type { AdminOrderAdvanceStatus };
