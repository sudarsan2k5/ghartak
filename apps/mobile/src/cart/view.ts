import type { CartItem, CartLineStatus } from "./types";

export type ProductCardCartMode =
  | { kind: "unavailable"; label: string }
  | { kind: "controls"; quantity: number; maxQuantity: number };

export type BasketBarView =
  | { visible: false }
  | {
      visible: true;
      itemCount: number;
      quote: "confirming" | "unconfirmed" | "ready";
      subtotalPaise: number | null;
      caption: string;
    };

export function quantityForProduct(items: readonly CartItem[], productId: string): number {
  return items.find((item) => item.productId === productId)?.quantity ?? 0;
}

export function productCardCartMode(
  product: {
    stock: { quantity: number; availability: "available" | "out_of_stock"; purchasable: boolean };
  },
  quantity: number,
): ProductCardCartMode {
  if (!product.stock.purchasable) {
    return { kind: "unavailable", label: "Unavailable" };
  }
  if (product.stock.availability !== "available" || product.stock.quantity < 1) {
    return { kind: "unavailable", label: "Out of stock" };
  }
  return { kind: "controls", quantity, maxQuantity: product.stock.quantity };
}

export function basketBarView(input: {
  itemCount: number;
  subtotalPaise: number;
  isConfirming: boolean;
  canCheckout: boolean;
  checkoutBlockReason: string | null;
  lines: readonly { status: CartLineStatus }[];
}): BasketBarView {
  if (input.itemCount < 1) {
    return { visible: false };
  }
  if (input.isConfirming || input.lines.some((line) => line.status.kind === "loading")) {
    return {
      visible: true,
      itemCount: input.itemCount,
      quote: "confirming",
      subtotalPaise: null,
      caption: "Checking prices",
    };
  }
  if (!input.canCheckout) {
    return {
      visible: true,
      itemCount: input.itemCount,
      quote: "unconfirmed",
      subtotalPaise: null,
      caption: input.checkoutBlockReason ?? "Price unavailable",
    };
  }
  return {
    visible: true,
    itemCount: input.itemCount,
    quote: "ready",
    subtotalPaise: input.subtotalPaise,
    caption: "View cart",
  };
}

export type CheckoutReadinessCode = "empty" | "confirming" | "unconfirmed" | "unavailable" | "over_stock" | "ready";

export type CheckoutReadiness = {
  ready: boolean;
  code: CheckoutReadinessCode;
  itemCount: number;
  subtotalPaise: number | null;
  pricesConfirmed: boolean;
  allPurchasable: boolean;
  quantitiesWithinStock: boolean;
  reason: string;
};

export type CartLinePresentation = {
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  stockQuantity: number | null;
  message: string | null;
  allowQuantityChange: boolean;
  allowRemove: boolean;
  allowRetry: boolean;
};

export function lineTotalPaise(quantity: number, status: CartLineStatus): number | null {
  if (status.kind === "available" || status.kind === "over_stock") {
    return status.pricePaise * quantity;
  }
  return null;
}

export function cartLinePresentation(quantity: number, status: CartLineStatus): CartLinePresentation {
  if (status.kind === "loading") {
    return {
      unitPricePaise: null,
      lineTotalPaise: null,
      stockQuantity: null,
      message: "Checking current price and stock.",
      allowQuantityChange: false,
      allowRemove: true,
      allowRetry: false,
    };
  }
  if (status.kind === "unconfirmed") {
    return {
      unitPricePaise: null,
      lineTotalPaise: null,
      stockQuantity: null,
      message: status.message,
      allowQuantityChange: false,
      allowRemove: true,
      allowRetry: true,
    };
  }
  if (status.kind === "unavailable") {
    return {
      unitPricePaise: null,
      lineTotalPaise: null,
      stockQuantity: null,
      message: status.message,
      allowQuantityChange: false,
      allowRemove: true,
      allowRetry: false,
    };
  }
  if (status.kind === "over_stock") {
    return {
      unitPricePaise: status.pricePaise,
      lineTotalPaise: lineTotalPaise(quantity, status),
      stockQuantity: status.stockQuantity,
      message: status.message,
      allowQuantityChange: true,
      allowRemove: true,
      allowRetry: false,
    };
  }
  return {
    unitPricePaise: status.pricePaise,
    lineTotalPaise: lineTotalPaise(quantity, status),
    stockQuantity: status.stockQuantity,
    message: null,
    allowQuantityChange: true,
    allowRemove: true,
    allowRetry: false,
  };
}

export function checkoutReadiness(input: {
  itemCount: number;
  subtotalPaise: number;
  lines: readonly { status: CartLineStatus }[];
}): CheckoutReadiness {
  if (input.itemCount < 1 || input.lines.length === 0) {
    return {
      ready: false,
      code: "empty",
      itemCount: 0,
      subtotalPaise: null,
      pricesConfirmed: false,
      allPurchasable: false,
      quantitiesWithinStock: true,
      reason: "Your cart is empty.",
    };
  }
  const confirming = input.lines.some((line) => line.status.kind === "loading");
  const unconfirmed = input.lines.some((line) => line.status.kind === "unconfirmed");
  const unavailable = input.lines.some((line) => line.status.kind === "unavailable");
  const overStock = input.lines.some((line) => line.status.kind === "over_stock");
  const pricesConfirmed = input.lines.every(
    (line) => line.status.kind === "available" || line.status.kind === "over_stock",
  );
  const allPurchasable = input.lines.every(
    (line) => line.status.kind === "available" || line.status.kind === "over_stock",
  );
  const quantitiesWithinStock = input.lines.every((line) => line.status.kind === "available");
  const confirmedTotal = pricesConfirmed ? input.subtotalPaise : null;

  if (confirming) {
    return {
      ready: false,
      code: "confirming",
      itemCount: input.itemCount,
      subtotalPaise: null,
      pricesConfirmed: false,
      allPurchasable: false,
      quantitiesWithinStock: false,
      reason: "Checking current prices and stock.",
    };
  }
  if (unconfirmed) {
    return {
      ready: false,
      code: "unconfirmed",
      itemCount: input.itemCount,
      subtotalPaise: null,
      pricesConfirmed: false,
      allPurchasable: false,
      quantitiesWithinStock: false,
      reason: "Current prices and stock still need to be confirmed.",
    };
  }
  if (unavailable) {
    return {
      ready: false,
      code: "unavailable",
      itemCount: input.itemCount,
      subtotalPaise: confirmedTotal,
      pricesConfirmed,
      allPurchasable: false,
      quantitiesWithinStock: false,
      reason: "Remove unavailable products before checkout.",
    };
  }
  if (overStock) {
    return {
      ready: false,
      code: "over_stock",
      itemCount: input.itemCount,
      subtotalPaise: confirmedTotal,
      pricesConfirmed: true,
      allPurchasable: true,
      quantitiesWithinStock: false,
      reason: "Reduce quantities that are above current stock before checkout.",
    };
  }
  return {
    ready: quantitiesWithinStock && pricesConfirmed && allPurchasable,
    code: "ready",
    itemCount: input.itemCount,
    subtotalPaise: confirmedTotal,
    pricesConfirmed: true,
    allPurchasable: true,
    quantitiesWithinStock: true,
    reason: "Ready for checkout.",
  };
}
