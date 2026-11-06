import type { GuestCheckoutResponse } from "@ghartak/contracts";

let placedOrder: GuestCheckoutResponse | null = null;

export function rememberPlacedOrder(order: GuestCheckoutResponse): void {
  placedOrder = order;
}

export function readPlacedOrder(): GuestCheckoutResponse | null {
  return placedOrder;
}

export function forgetPlacedOrder(): void {
  placedOrder = null;
}

export function commitSuccessfulCheckout(
  order: GuestCheckoutResponse,
  cart: { clear: () => void },
): void {
  rememberPlacedOrder(order);
  cart.clear();
}

export function paymentMethodLabel(method: GuestCheckoutResponse["paymentMethod"]): string {
  return method === "cash_on_delivery" ? "Cash on Delivery" : method;
}

export function paymentStatusLabel(status: GuestCheckoutResponse["paymentStatus"]): string {
  if (status === "pending") {
    return "Pending · unpaid";
  }
  return status;
}

export function orderStatusLabel(status: GuestCheckoutResponse["status"]): string {
  if (status === "placed") {
    return "Placed";
  }
  if (status === "out_for_delivery") {
    return "Out for delivery";
  }
  return status.replaceAll("_", " ");
}

export function formatOrderTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
