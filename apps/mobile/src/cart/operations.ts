import type { CartDisplay, CartError, CartItem, CartOffer, CartResult } from "./types";

export function emptyCart(): CartItem[] {
  return [];
}

export function itemCount(items: readonly CartItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.quantity;
  }
  return total;
}

export function addProduct(items: readonly CartItem[], offer: CartOffer, quantity = 1): CartResult {
  const parsed = parseQuantity(quantity);
  if (!parsed.ok) {
    return fail(items, parsed.error);
  }
  const blocked = offerBlock(offer);
  if (blocked) {
    return fail(items, blocked);
  }
  const existing = items.find((item) => item.productId === offer.id);
  const nextQuantity = (existing?.quantity ?? 0) + parsed.quantity;
  const stock = stockBlock(offer, nextQuantity);
  if (stock) {
    return fail(items, stock);
  }
  if (existing) {
    return ok(replaceItem(items, offer.id, { ...existing, quantity: nextQuantity, display: displayFrom(offer) }));
  }
  return ok([
    ...items,
    {
      productId: offer.id,
      quantity: parsed.quantity,
      display: displayFrom(offer),
    },
  ]);
}

export function increaseQuantity(items: readonly CartItem[], offer: CartOffer): CartResult {
  const existing = items.find((item) => item.productId === offer.id);
  if (!existing) {
    return addProduct(items, offer, 1);
  }
  return addProduct(items, offer, 1);
}

export function decreaseQuantity(items: readonly CartItem[], productId: string): CartResult {
  const existing = items.find((item) => item.productId === productId);
  if (!existing) {
    return fail(items, { code: "missing", message: "That product is not in the cart." });
  }
  if (existing.quantity <= 1) {
    return ok(items.filter((item) => item.productId !== productId));
  }
  return ok(replaceItem(items, productId, { ...existing, quantity: existing.quantity - 1 }));
}

export function setQuantity(items: readonly CartItem[], offer: CartOffer, quantity: number): CartResult {
  const parsed = parseQuantity(quantity);
  if (!parsed.ok) {
    return fail(items, parsed.error);
  }
  const existing = items.find((item) => item.productId === offer.id);
  const decreasing = existing !== undefined && parsed.quantity < existing.quantity;
  if (!decreasing) {
    const blocked = offerBlock(offer);
    if (blocked) {
      return fail(items, blocked);
    }
    const stock = stockBlock(offer, parsed.quantity);
    if (stock) {
      return fail(items, stock);
    }
  }
  if (!existing) {
    return addProduct(items, offer, parsed.quantity);
  }
  return ok(replaceItem(items, offer.id, { ...existing, quantity: parsed.quantity, display: displayFrom(offer) }));
}

export function applyQuantity(items: readonly CartItem[], offer: CartOffer, quantity: number): CartResult {
  if (quantity === 0) {
    return ok(items.filter((item) => item.productId !== offer.id));
  }
  return setQuantity(items, offer, quantity);
}

export function removeProduct(items: readonly CartItem[], productId: string): CartResult {
  if (!items.some((item) => item.productId === productId)) {
    return fail(items, { code: "missing", message: "That product is not in the cart." });
  }
  return ok(items.filter((item) => item.productId !== productId));
}

export function clearCart(): CartResult {
  return ok([]);
}

function offerBlock(offer: CartOffer): CartError | null {
  if (!Number.isSafeInteger(offer.pricePaise) || offer.pricePaise < 0) {
    return { code: "unavailable" as const, message: "This product cannot be added right now." };
  }
  if (!offer.stock.purchasable) {
    return { code: "not_purchasable" as const, message: "This product is not available to buy." };
  }
  if (offer.stock.availability !== "available" || offer.stock.quantity < 1) {
    return { code: "out_of_stock" as const, message: "This product is out of stock." };
  }
  return null;
}

function stockBlock(offer: CartOffer, quantity: number) {
  if (quantity > offer.stock.quantity) {
    return {
      code: "exceeds_stock" as const,
      message: `Only ${offer.stock.quantity} are available.`,
    };
  }
  return null;
}

function parseQuantity(quantity: number): { ok: true; quantity: number } | { ok: false; error: { code: "invalid_quantity"; message: string } } {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return { ok: false, error: { code: "invalid_quantity", message: "Choose at least one item." } };
  }
  return { ok: true, quantity };
}

function displayFrom(offer: CartOffer): CartDisplay {
  return {
    name: offer.name,
    packageLabel: offer.packageLabel,
    deliveryPath: offer.deliveryPath,
  };
}

function replaceItem(items: readonly CartItem[], productId: string, next: CartItem): CartItem[] {
  return items.map((item) => (item.productId === productId ? next : item));
}

function ok(items: CartItem[]): CartResult {
  return { ok: true, items };
}

function fail(items: readonly CartItem[], error: CartError): CartResult {
  return { ok: false, error, items: [...items] };
}
