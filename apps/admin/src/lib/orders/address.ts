import type { AdminOrderDetail } from "@ghartak/contracts";

export function formatDeliveryAddress(address: AdminOrderDetail["address"]): string {
  const lines = [
    address.line1,
    address.line2,
    address.landmark ? `Landmark: ${address.landmark}` : null,
    [address.locality, address.city, address.state].filter(Boolean).join(", "),
    address.postalCode,
  ].filter((line): line is string => Boolean(line && line.trim()));
  return lines.join("\n");
}

export function paymentMethodLabel(value: string): string {
  if (value === "cash_on_delivery") {
    return "Cash on delivery";
  }
  return value.replaceAll("_", " ");
}
