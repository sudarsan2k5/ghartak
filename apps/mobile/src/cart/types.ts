export type CartDisplay = {
  name: string;
  packageLabel: string;
  deliveryPath: string | null;
};

export type CartItem = {
  productId: string;
  quantity: number;
  display: CartDisplay | null;
};

export type CartSnapshot = {
  items: CartItem[];
};

export type CartOffer = {
  id: string;
  name: string;
  packageLabel: string;
  deliveryPath: string | null;
  pricePaise: number;
  stock: {
    quantity: number;
    availability: "available" | "out_of_stock";
    purchasable: boolean;
  };
};

export type CartErrorCode =
  | "invalid_quantity"
  | "unavailable"
  | "not_purchasable"
  | "out_of_stock"
  | "exceeds_stock"
  | "missing";

export type CartError = {
  code: CartErrorCode;
  message: string;
};

export type CartResult = { ok: true; items: CartItem[] } | { ok: false; error: CartError; items: CartItem[] };

export type CartLineStatus =
  | { kind: "loading" }
  | { kind: "unconfirmed"; message: string }
  | { kind: "available"; pricePaise: number; stockQuantity: number }
  | { kind: "over_stock"; pricePaise: number; stockQuantity: number; message: string }
  | { kind: "unavailable"; message: string };

export const cartStorageKey = "ghartak.guest-cart.v1";
