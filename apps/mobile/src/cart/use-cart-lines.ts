import { useQueries } from "@tanstack/react-query";

import { getProduct } from "@/api/client";
import { catalogueKeys } from "@/query/catalogue";
import { useCartStore } from "@/state/cart";
import { itemCount } from "./operations";
import { assessCartLine, canCheckout, checkoutBlockReason, offerFromCatalogue, subtotalPaise } from "./quotes";
import type { CartItem, CartLineStatus, CartOffer } from "./types";
import { quantityForProduct } from "./view";

export type CartLine = {
  item: CartItem;
  status: CartLineStatus;
  offer: CartOffer | null;
};

export function useCartLines(): {
  items: CartItem[];
  lines: CartLine[];
  itemCount: number;
  subtotalPaise: number;
  canCheckout: boolean;
  checkoutBlockReason: string | null;
  isConfirming: boolean;
  refetch: () => Promise<void>;
} {
  const items = useCartStore((state) => state.items);
  const queries = useQueries({
    queries: items.map((item) => ({
      queryKey: catalogueKeys.product(item.productId),
      queryFn: ({ signal }: { signal: AbortSignal }) => getProduct(item.productId, signal),
      staleTime: 60_000,
      retry: 1,
    })),
  });
  const lines = items.map((item, index) => {
    const query = queries[index];
    const product = query?.data ?? undefined;
    const state: "loading" | "error" | "success" = query?.isPending
      ? "loading"
      : query?.isError && product === undefined
        ? "error"
        : "success";
    return {
      item,
      status: assessCartLine(item, product, state),
      offer: product ? offerFromCatalogue(product) : null,
    };
  });
  return {
    items,
    lines,
    itemCount: itemCount(items),
    subtotalPaise: subtotalPaise(lines.map((line) => ({ quantity: line.item.quantity, status: line.status }))),
    canCheckout: canCheckout(lines),
    checkoutBlockReason: checkoutBlockReason(lines),
    isConfirming: lines.some((line) => line.status.kind === "loading"),
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()));
    },
  };
}

export function useCartQuantity(productId: string): number {
  return useCartStore((state) => quantityForProduct(state.items, productId));
}
