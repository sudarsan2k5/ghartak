import type { CustomerOrderStatusEvent, CustomerOrderStatusResponse, OrderStatus } from "@ghartak/contracts";

export const trackingLifecycle = [
  "placed",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
] as const;

const stepLabels: Record<(typeof trackingLifecycle)[number], string> = {
  placed: "Order placed",
  confirmed: "Order confirmed",
  packed: "Preparing your order",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export type TimelineStepState = "complete" | "current" | "pending";

export type TimelineStep = {
  status: (typeof trackingLifecycle)[number];
  label: string;
  state: TimelineStepState;
  occurredAt: string | null;
};

export function eventTimeByStatus(events: readonly CustomerOrderStatusEvent[]): Map<OrderStatus, string> {
  const times = new Map<OrderStatus, string>();
  const ordered = [...events].sort((left, right) => {
    const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    return left.status.localeCompare(right.status);
  });
  for (const event of ordered) {
    if (!times.has(event.status)) {
      times.set(event.status, event.createdAt);
    }
  }
  return times;
}

export function buildTrackingTimeline(order: CustomerOrderStatusResponse): TimelineStep[] {
  const times = eventTimeByStatus(order.events);
  if (order.status === "cancelled") {
    return [];
  }
  const currentIndex = trackingLifecycle.indexOf(order.status);
  return trackingLifecycle.map((status, index) => {
    let state: TimelineStepState = "pending";
    if (currentIndex === -1) {
      state = times.has(status) ? "complete" : "pending";
    } else if (index < currentIndex) {
      state = "complete";
    } else if (index === currentIndex) {
      state = "current";
    }
    return {
      status,
      label: stepLabels[status],
      state,
      occurredAt: state === "pending" ? null : (times.get(status) ?? null),
    };
  });
}

export function cancelledEventTime(events: readonly CustomerOrderStatusEvent[]): string | null {
  return eventTimeByStatus(events).get("cancelled") ?? null;
}

export function hasFabricatedPendingTime(steps: readonly TimelineStep[]): boolean {
  return steps.some((step) => step.state === "pending" && step.occurredAt !== null);
}
