import type { AdminOrderListResponse, AdminOrderSummary } from "@ghartak/contracts";

export type OrderListPhase =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: AdminOrderListResponse; summary: AdminOrderSummary | null };

export type OrderListView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; summary: AdminOrderSummary | null }
  | { kind: "ready"; data: AdminOrderListResponse; summary: AdminOrderSummary | null };

export function orderListView(input: OrderListPhase): OrderListView {
  if (input.phase === "loading") {
    return { kind: "loading" };
  }
  if (input.phase === "error") {
    return { kind: "error", message: input.message };
  }
  if (input.data.orders.length === 0) {
    return { kind: "empty", summary: input.summary };
  }
  return { kind: "ready", data: input.data, summary: input.summary };
}

export function validateCancelReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return "A cancellation reason is required.";
  }
  if (trimmed.length > 200) {
    return "Use 200 characters or fewer.";
  }
  return null;
}

export function beginOrderAction(pending: boolean): boolean {
  return !pending;
}
