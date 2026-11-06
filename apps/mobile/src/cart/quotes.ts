import type { CatalogueProductSummary, ProductDetailResponse } from "@ghartak/contracts";

import type { CartItem, CartLineStatus, CartOffer } from "./types";

export function offerFromCatalogue(
  product: Pick<CatalogueProductSummary, "id" | "name" | "packageLabel" | "pricePaise" | "stock" | "primaryImage">,
): CartOffer {
  return {
    id: product.id,
    name: product.name,
    packageLabel: product.packageLabel,
    deliveryPath: product.primaryImage?.deliveryPath ?? null,
    pricePaise: product.pricePaise,
    stock: product.stock,
  };
}

export function offerFromDetail(product: ProductDetailResponse): CartOffer {
  return offerFromCatalogue(product);
}

export function assessCartLine(
  item: CartItem,
  product: ProductDetailResponse | CatalogueProductSummary | null | undefined,
  queryState: "loading" | "error" | "success",
): CartLineStatus {
  if (queryState === "loading") {
    return { kind: "loading" };
  }
  if (queryState === "error") {
    return { kind: "unconfirmed", message: "Current price and stock could not be confirmed. Try again before checkout." };
  }
  if (product === null || product === undefined) {
    return {
      kind: "unavailable",
      message: "This product is no longer in the catalogue. Remove it to continue.",
    };
  }
  if (!Number.isSafeInteger(product.pricePaise) || product.pricePaise < 0) {
    return { kind: "unavailable", message: "This product is no longer available to buy. Remove it to continue." };
  }
  if (!product.stock.purchasable || product.stock.availability !== "available" || product.stock.quantity < 1) {
    return { kind: "unavailable", message: "This product is not available to buy. Remove it to continue." };
  }
  if (item.quantity > product.stock.quantity) {
    return {
      kind: "over_stock",
      pricePaise: product.pricePaise,
      stockQuantity: product.stock.quantity,
      message: `Only ${product.stock.quantity} are available. Reduce the quantity to continue.`,
    };
  }
  return { kind: "available", pricePaise: product.pricePaise, stockQuantity: product.stock.quantity };
}

export function subtotalPaise(lines: readonly { quantity: number; status: CartLineStatus }[]): number {
  let total = 0;
  for (const line of lines) {
    if (line.status.kind === "available" || line.status.kind === "over_stock") {
      total += line.status.pricePaise * line.quantity;
    }
  }
  return total;
}

export function canCheckout(lines: readonly { status: CartLineStatus }[]): boolean {
  if (lines.length === 0) {
    return false;
  }
  return lines.every((line) => line.status.kind === "available");
}

export function checkoutBlockReason(lines: readonly { status: CartLineStatus }[]): string | null {
  if (lines.length === 0) {
    return "Your cart is empty.";
  }
  if (lines.some((line) => line.status.kind === "loading" || line.status.kind === "unconfirmed")) {
    return "Current prices and stock still need to be confirmed.";
  }
  if (lines.some((line) => line.status.kind === "unavailable")) {
    return "Remove unavailable products before checkout.";
  }
  if (lines.some((line) => line.status.kind === "over_stock")) {
    return "Reduce quantities that are above current stock before checkout.";
  }
  return null;
}
