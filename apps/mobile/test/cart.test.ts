import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addProduct,
  applyQuantity,
  clearCart,
  decreaseQuantity,
  emptyCart,
  increaseQuantity,
  itemCount,
  removeProduct,
  setQuantity,
} from "../src/cart/operations.ts";
import { persistCart, restoreCart } from "../src/cart/persist.ts";
import { assessCartLine, canCheckout, checkoutBlockReason, subtotalPaise } from "../src/cart/quotes.ts";
import type { CartOffer } from "../src/cart/types.ts";
import {
  basketBarView,
  cartLinePresentation,
  checkoutReadiness,
  lineTotalPaise,
  productCardCartMode,
  quantityForProduct,
} from "../src/cart/view.ts";
import { formatRupees } from "../src/theme/money.ts";

const dalId = "10000000-0000-4000-8000-000000000031";
const milkId = "10000000-0000-4000-8000-000000000033";

function offer(overrides: Partial<CartOffer> = {}): CartOffer {
  return {
    id: dalId,
    name: "Toor Dal",
    packageLabel: "1 kg",
    deliveryPath: "/catalog/dal.jpg",
    pricePaise: 12000,
    stock: { quantity: 40, availability: "available", purchasable: true },
    ...overrides,
  };
}

describe("guest cart operations", () => {
  it("adds a product once and increases quantity instead of duplicating", () => {
    const first = addProduct(emptyCart(), offer(), 2);
    assert.equal(first.ok, true);
    const second = addProduct(first.items, offer(), 3);
    assert.equal(second.ok, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0]?.productId, dalId);
    assert.equal(second.items[0]?.quantity, 5);
    assert.equal(itemCount(second.items), 5);
  });

  it("increases and decreases quantity", () => {
    const added = addProduct(emptyCart(), offer(), 2);
    const increased = increaseQuantity(added.items, offer());
    assert.equal(increased.ok, true);
    assert.equal(increased.items[0]?.quantity, 3);
    const decreased = decreaseQuantity(increased.items, dalId);
    assert.equal(decreased.ok, true);
    assert.equal(decreased.items[0]?.quantity, 2);
    const removed = decreaseQuantity(decreaseQuantity(decreased.items, dalId).items, dalId);
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.items, []);
  });

  it("sets quantity and rejects invalid values", () => {
    const added = addProduct(emptyCart(), offer(), 1);
    const set = setQuantity(added.items, offer(), 4);
    assert.equal(set.ok, true);
    assert.equal(set.items[0]?.quantity, 4);
    const zero = setQuantity(set.items, offer(), 0);
    assert.equal(zero.ok, false);
    if (!zero.ok) {
      assert.equal(zero.error.code, "invalid_quantity");
    }
    assert.equal(zero.items[0]?.quantity, 4);
    const fraction = setQuantity(set.items, offer(), 1.5);
    assert.equal(fraction.ok, false);
  });

  it("removes a product and clears the cart", () => {
    const withDal = addProduct(emptyCart(), offer(), 1);
    const withMilk = addProduct(withDal.items, offer({ id: milkId, name: "Toned Milk", pricePaise: 5600 }), 2);
    assert.equal(itemCount(withMilk.items), 3);
    const removed = removeProduct(withMilk.items, dalId);
    assert.equal(removed.ok, true);
    assert.equal(removed.items.length, 1);
    assert.equal(removed.items[0]?.productId, milkId);
    const cleared = clearCart();
    assert.equal(cleared.ok, true);
    assert.equal(cleared.items.length, 0);
  });

  it("rejects stock above the current catalogue quantity", () => {
    const added = addProduct(emptyCart(), offer(), 40);
    assert.equal(added.ok, true);
    const extra = addProduct(added.items, offer(), 1);
    assert.equal(extra.ok, false);
    if (!extra.ok) {
      assert.equal(extra.error.code, "exceeds_stock");
    }
    assert.equal(extra.items[0]?.quantity, 40);
  });

  it("rejects products that are not available to buy", () => {
    const unpublished = addProduct(emptyCart(), offer({ stock: { quantity: 10, availability: "available", purchasable: false } }), 1);
    assert.equal(unpublished.ok, false);
    if (!unpublished.ok) {
      assert.equal(unpublished.error.code, "not_purchasable");
    }
    const emptyStock = addProduct(emptyCart(), offer({ stock: { quantity: 0, availability: "out_of_stock", purchasable: true } }), 1);
    assert.equal(emptyStock.ok, false);
    if (!emptyStock.ok) {
      assert.equal(emptyStock.error.code, "out_of_stock");
    }
    assert.equal(emptyCart().length, 0);
  });

  it("applies a quantity of zero as a removal", () => {
    const added = addProduct(emptyCart(), offer(), 2);
    const gone = applyQuantity(added.items, offer(), 0);
    assert.equal(gone.ok, true);
    assert.equal(gone.items.length, 0);
  });
});

describe("guest cart persistence", () => {
  it("restores product ids and quantities without trusted prices", () => {
    const added = addProduct(emptyCart(), offer(), 2);
    const snapshot = persistCart(added.items);
    assert.equal("pricePaise" in snapshot.items[0]!, false);
    const restored = restoreCart(snapshot);
    assert.equal(restored[0]?.productId, dalId);
    assert.equal(restored[0]?.quantity, 2);
    assert.equal(restored[0]?.display?.name, "Toor Dal");
  });

  it("drops corrupted rows and merges duplicate product ids", () => {
    assert.deepEqual(restoreCart("nope"), []);
    assert.deepEqual(restoreCart({ items: [{ productId: "bad", quantity: 1 }] }), []);
    assert.deepEqual(restoreCart({ items: [{ productId: dalId, quantity: 0 }] }), []);
    const merged = restoreCart({
      items: [
        { productId: dalId, quantity: 2, display: { name: "Toor Dal", packageLabel: "1 kg", deliveryPath: null } },
        { productId: dalId, quantity: 3, pricePaise: 1, stockQuantity: 99, token: "secret" },
      ],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.quantity, 5);
    assert.equal("pricePaise" in (merged[0] ?? {}), false);
    const nested = restoreCart({
      state: { items: [{ productId: dalId, quantity: 1, display: { name: "Toor Dal", packageLabel: "1 kg", deliveryPath: null } }] },
      version: 0,
    });
    assert.equal(nested[0]?.quantity, 1);
  });
});

describe("guest cart quotes", () => {
  it("uses integer paise for the subtotal and keeps unavailable products visible", () => {
    const items = addProduct(emptyCart(), offer(), 2).items;
    const available = assessCartLine(items[0]!, { ...catalogue(), pricePaise: 12000, stock: { quantity: 40, availability: "available", purchasable: true } }, "success");
    assert.equal(available.kind, "available");
    const total = subtotalPaise([{ quantity: 2, status: available }]);
    assert.equal(total, 24000);
    const milkLine = assessCartLine(
      { productId: milkId, quantity: 3, display: null },
      { ...catalogue(), id: milkId, pricePaise: 5600, stock: { quantity: 24, availability: "available", purchasable: true } },
      "success",
    );
    assert.equal(subtotalPaise([{ quantity: 2, status: available }, { quantity: 3, status: milkLine }]), 40800);
    const missing = assessCartLine(items[0]!, null, "success");
    assert.equal(missing.kind, "unavailable");
    assert.equal(canCheckout([{ status: missing }]), false);
    assert.match(checkoutBlockReason([{ status: missing }]) ?? "", /Remove unavailable/);
    const over = assessCartLine({ productId: dalId, quantity: 12, display: null }, { ...catalogue(), stock: { quantity: 4, availability: "available", purchasable: true } }, "success");
    assert.equal(over.kind, "over_stock");
    if (over.kind === "over_stock") {
      assert.equal(over.stockQuantity, 4);
    }
    const unconfirmed = assessCartLine(items[0]!, undefined, "error");
    assert.equal(unconfirmed.kind, "unconfirmed");
    assert.equal(canCheckout([{ status: unconfirmed }]), false);
  });
});

describe("shopping surfaces share one cart", () => {
  it("reads the same quantity on home, categories, search, and details", () => {
    const afterHome = addProduct(emptyCart(), offer(), 1);
    const afterSearch = increaseQuantity(afterHome.items, offer());
    const afterDetails = setQuantity(afterSearch.items, offer(), 4);
    assert.equal(quantityForProduct(afterDetails.items, dalId), 4);
    assert.equal(quantityForProduct(afterDetails.items, milkId), 0);
    assert.equal(itemCount(afterDetails.items), 4);
  });

  it("updates every surface after remove and after restore", () => {
    const filled = addProduct(addProduct(emptyCart(), offer(), 2).items, offer({ id: milkId, name: "Toned Milk", pricePaise: 5600 }), 1);
    const removed = removeProduct(filled.items, dalId);
    assert.equal(quantityForProduct(removed.items, dalId), 0);
    assert.equal(quantityForProduct(removed.items, milkId), 1);
    assert.equal(itemCount(removed.items), 1);
    const restored = restoreCart(persistCart(filled.items));
    assert.equal(quantityForProduct(restored, dalId), 2);
    assert.equal(quantityForProduct(restored, milkId), 1);
  });

  it("lets a customer reduce an over-stock line toward current stock", () => {
    const added = addProduct(emptyCart(), offer(), 8);
    const reduced = setQuantity(added.items, offer({ stock: { quantity: 3, availability: "available", purchasable: true } }), 7);
    assert.equal(reduced.ok, true);
    assert.equal(reduced.items[0]?.quantity, 7);
    const raised = setQuantity(reduced.items, offer({ stock: { quantity: 3, availability: "available", purchasable: true } }), 8);
    assert.equal(raised.ok, false);
  });
});

describe("product card cart mode", () => {
  it("shows add/stepper for purchasable stock and blocks unavailable products", () => {
    assert.deepEqual(
      productCardCartMode({ stock: { quantity: 40, availability: "available", purchasable: true } }, 2),
      { kind: "controls", quantity: 2, maxQuantity: 40 },
    );
    assert.equal(
      productCardCartMode({ stock: { quantity: 0, availability: "out_of_stock", purchasable: false } }, 0).kind,
      "unavailable",
    );
    assert.equal(
      productCardCartMode({ stock: { quantity: 12, availability: "available", purchasable: false } }, 1).kind,
      "unavailable",
    );
    const unavailable = productCardCartMode({ stock: { quantity: 12, availability: "available", purchasable: false } }, 1);
    if (unavailable.kind === "unavailable") {
      assert.equal(unavailable.label, "Unavailable");
    }
    const out = productCardCartMode({ stock: { quantity: 0, availability: "out_of_stock", purchasable: true } }, 0);
    if (out.kind === "unavailable") {
      assert.equal(out.label, "Out of stock");
    }
  });
});

describe("basket bar live quotes", () => {
  it("hides when empty and does not show a ready total while quotes are loading", () => {
    const empty = basketBarView({
      itemCount: 0,
      subtotalPaise: 0,
      isConfirming: false,
      canCheckout: false,
      checkoutBlockReason: "Your cart is empty.",
      lines: [],
    });
    assert.equal(empty.visible, false);
    const loading = basketBarView({
      itemCount: 2,
      subtotalPaise: 0,
      isConfirming: true,
      canCheckout: false,
      checkoutBlockReason: "Current prices and stock still need to be confirmed.",
      lines: [{ status: { kind: "loading" } }],
    });
    assert.equal(loading.visible, true);
    if (loading.visible) {
      assert.equal(loading.quote, "confirming");
      assert.equal(loading.subtotalPaise, null);
      assert.equal(loading.itemCount, 2);
      assert.equal(loading.caption, "Checking prices");
    }
  });

  it("shows a two-decimal subtotal only from confirmed live catalogue prices", () => {
    const items = addProduct(emptyCart(), offer(), 2).items;
    const available = assessCartLine(items[0]!, catalogue(), "success");
    const ready = basketBarView({
      itemCount: 2,
      subtotalPaise: subtotalPaise([{ quantity: 2, status: available }]),
      isConfirming: false,
      canCheckout: true,
      checkoutBlockReason: null,
      lines: [{ status: available }],
    });
    assert.equal(ready.visible, true);
    if (ready.visible) {
      assert.equal(ready.quote, "ready");
      assert.equal(ready.subtotalPaise, 24000);
      assert.equal(formatRupees(ready.subtotalPaise ?? 0, { fractionDigits: 2 }), "₹240.00");
    }
    const unavailable = assessCartLine(items[0]!, null, "success");
    const blocked = basketBarView({
      itemCount: 2,
      subtotalPaise: 0,
      isConfirming: false,
      canCheckout: false,
      checkoutBlockReason: checkoutBlockReason([{ status: unavailable }]),
      lines: [{ status: unavailable }],
    });
    assert.equal(blocked.visible, true);
    if (blocked.visible) {
      assert.equal(blocked.quote, "unconfirmed");
      assert.equal(blocked.subtotalPaise, null);
    }
  });
});

describe("cart screen checkout readiness", () => {
  it("is not ready when empty, loading, or unconfirmed, and hides the basket total", () => {
    assert.equal(
      checkoutReadiness({ itemCount: 0, subtotalPaise: 0, lines: [] }).code,
      "empty",
    );
    const loading = checkoutReadiness({
      itemCount: 2,
      subtotalPaise: 24000,
      lines: [{ status: { kind: "loading" } }],
    });
    assert.equal(loading.ready, false);
    assert.equal(loading.pricesConfirmed, false);
    assert.equal(loading.subtotalPaise, null);
    const error = checkoutReadiness({
      itemCount: 2,
      subtotalPaise: 0,
      lines: [{ status: { kind: "unconfirmed", message: "offline" } }],
    });
    assert.equal(error.code, "unconfirmed");
    assert.equal(error.subtotalPaise, null);
  });

  it("keeps unavailable products and blocks checkout", () => {
    const available = assessCartLine(addProduct(emptyCart(), offer(), 2).items[0]!, catalogue(), "success");
    const missing = assessCartLine({ productId: milkId, quantity: 1, display: null }, null, "success");
    const blocked = checkoutReadiness({
      itemCount: 3,
      subtotalPaise: 24000,
      lines: [{ status: available }, { status: missing }],
    });
    assert.equal(blocked.ready, false);
    assert.equal(blocked.code, "unavailable");
    assert.equal(blocked.allPurchasable, false);
    assert.equal(blocked.subtotalPaise, null);
    const row = cartLinePresentation(1, missing);
    assert.equal(row.allowRemove, true);
    assert.equal(row.allowQuantityChange, false);
    assert.equal(row.lineTotalPaise, null);
    assert.match(row.message ?? "", /no longer in the catalogue/);
  });

  it("shows confirmed line totals for over-stock items and still blocks checkout", () => {
    const over = assessCartLine(
      { productId: dalId, quantity: 12, display: null },
      { ...catalogue(), stock: { quantity: 4, availability: "available", purchasable: true } },
      "success",
    );
    const summary = checkoutReadiness({
      itemCount: 12,
      subtotalPaise: subtotalPaise([{ quantity: 12, status: over }]),
      lines: [{ status: over }],
    });
    assert.equal(summary.ready, false);
    assert.equal(summary.code, "over_stock");
    assert.equal(summary.pricesConfirmed, true);
    assert.equal(summary.allPurchasable, true);
    assert.equal(summary.quantitiesWithinStock, false);
    assert.equal(summary.subtotalPaise, 144000);
    const row = cartLinePresentation(12, over);
    assert.equal(row.allowQuantityChange, true);
    assert.equal(row.stockQuantity, 4);
    assert.equal(row.lineTotalPaise, 144000);
    assert.equal(lineTotalPaise(12, over), 12 * 12000);
  });

  it("is ready only when every line is available with a confirmed live total", () => {
    const items = addProduct(emptyCart(), offer(), 2).items;
    const available = assessCartLine(items[0]!, catalogue(), "success");
    const ready = checkoutReadiness({
      itemCount: 2,
      subtotalPaise: subtotalPaise([{ quantity: 2, status: available }]),
      lines: [{ status: available }],
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.code, "ready");
    assert.equal(ready.pricesConfirmed, true);
    assert.equal(ready.allPurchasable, true);
    assert.equal(ready.quantitiesWithinStock, true);
    assert.equal(ready.subtotalPaise, 24000);
    assert.equal(formatRupees(ready.subtotalPaise ?? 0, { fractionDigits: 2 }), "₹240.00");
    const row = cartLinePresentation(2, available);
    assert.equal(row.unitPricePaise, 12000);
    assert.equal(row.lineTotalPaise, 24000);
  });
});

function catalogue() {
  return {
    id: dalId,
    name: "Toor Dal",
    brand: "Ghartak Staples",
    descriptionSummary: null,
    category: { id: "10000000-0000-4000-8000-000000000021", name: "Staples", slug: "staples" },
    unit: "kg" as const,
    packageSize: 1,
    packageLabel: "1 kg",
    pricePaise: 12000,
    stock: { quantity: 40, availability: "available" as const, purchasable: true },
    primaryImage: null,
  };
}
