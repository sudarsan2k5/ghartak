import type { OrderStatus } from "@ghartak/contracts";

export const trackingCopy = {
  title: "Track order",
  trackAction: "Track my order",
  refresh: "Refresh status",
  refreshing: "Updating",
  emptyTitle: "No order to track yet",
  emptyBody: "After you place an order, you can follow it here.",
  storeErrorTitle: "Tracking could not be opened",
  storeErrorBody: "This phone could not read the saved tracking details. Try again.",
  persistFailedTitle: "Tracking was not saved on this phone",
  persistRetry: "Save tracking on this phone",
  unavailableTitle: "Tracking is no longer available",
  unavailableBody: "This tracking link has expired or is no longer valid. Ghartak cannot look up an order by number alone.",
  networkTitle: "Could not update the order status",
  networkBody: "Check your connection and try again. Your order is still being processed.",
  rateLimitedTitle: "Please wait a moment",
  rateLimitedBody: "Too many status checks. Wait a little, then refresh.",
  serverTitle: "Status is temporarily unavailable",
  serverBody: "Try again in a little while. Your order is still with Ghartak.",
  mismatchTitle: "Order status could not be shown",
  lastUpdated: "Last updated",
} as const;

const labels: Record<OrderStatus, string> = {
  placed: "Order placed",
  confirmed: "Order confirmed",
  packed: "Preparing your order",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Order cancelled",
};

const headings: Record<OrderStatus, string> = {
  placed: "We have your order",
  confirmed: "Your order is confirmed",
  packed: "We are packing your bag",
  out_for_delivery: "Your order is on the way",
  delivered: "Your order has arrived",
  cancelled: "This order was cancelled",
};

const explanations: Record<OrderStatus, string> = {
  placed: "Ghartak has received your Cash on Delivery order.",
  confirmed: "The shop has confirmed your order and will start preparing it.",
  packed: "Your groceries are being packed.",
  out_for_delivery: "A delivery partner is bringing your order.",
  delivered: "Please keep cash ready if you have not already paid.",
  cancelled: "This order will not be delivered.",
};

export function trackingStatusLabel(status: OrderStatus): string {
  return labels[status];
}

export function trackingStatusHeading(status: OrderStatus): string {
  return headings[status];
}

export function trackingStatusExplanation(status: OrderStatus): string {
  return explanations[status];
}

export function trackingErrorCopy(
  kind: "timeout" | "network" | "unauthorized" | "unavailable" | "rate_limited" | "server" | "invalid",
): { title: string; body: string; retry: boolean } {
  if (kind === "unauthorized" || kind === "unavailable") {
    return { title: trackingCopy.unavailableTitle, body: trackingCopy.unavailableBody, retry: false };
  }
  if (kind === "rate_limited") {
    return { title: trackingCopy.rateLimitedTitle, body: trackingCopy.rateLimitedBody, retry: true };
  }
  if (kind === "timeout" || kind === "network") {
    return { title: trackingCopy.networkTitle, body: trackingCopy.networkBody, retry: true };
  }
  return { title: trackingCopy.serverTitle, body: trackingCopy.serverBody, retry: true };
}

export function canRefreshOrderStatus(isFetching: boolean): boolean {
  return !isFetching;
}

export function formatTrackingTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
