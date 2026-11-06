import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
} from "@/cart/operations";
import { persistCart, restoreCart } from "@/cart/persist";
import { cartStorageKey, type CartItem, type CartOffer, type CartResult } from "@/cart/types";

type CartStore = {
  items: CartItem[];
  add: (offer: CartOffer, quantity?: number) => CartResult;
  increase: (offer: CartOffer) => CartResult;
  decrease: (productId: string) => CartResult;
  setItemQuantity: (offer: CartOffer, quantity: number) => CartResult;
  applyItemQuantity: (offer: CartOffer, quantity: number) => CartResult;
  remove: (productId: string) => CartResult;
  clear: () => CartResult;
  count: () => number;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: emptyCart(),
      add: (offer, quantity = 1) => {
        const result = addProduct(get().items, offer, quantity);
        set({ items: result.items });
        return result;
      },
      increase: (offer) => {
        const result = increaseQuantity(get().items, offer);
        set({ items: result.items });
        return result;
      },
      decrease: (productId) => {
        const result = decreaseQuantity(get().items, productId);
        set({ items: result.items });
        return result;
      },
      setItemQuantity: (offer, quantity) => {
        const result = setQuantity(get().items, offer, quantity);
        set({ items: result.items });
        return result;
      },
      applyItemQuantity: (offer, quantity) => {
        const result = applyQuantity(get().items, offer, quantity);
        set({ items: result.items });
        return result;
      },
      remove: (productId) => {
        const result = removeProduct(get().items, productId);
        set({ items: result.items });
        return result;
      },
      clear: () => {
        const result = clearCart();
        set({ items: result.items });
        return result;
      },
      count: () => itemCount(get().items),
    }),
    {
      name: cartStorageKey,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: persistCart(state.items).items }),
      merge: (persisted, current) => ({
        ...current,
        items: restoreCart(persisted),
      }),
    },
  ),
);
