export type CatalogueCardProduct = {
  id: string;
  name: string;
  detail: string;
  unit: string;
  pricePaise: number;
  mrpPaise: number | null;
  discountPercent: number | null;
  deliveryPath: string | null;
  imageAlt: string | null;
  purchasable: boolean;
};

/** Whole-percent saving, rounded down so a label never overstates the discount. */
export function discountPercent(pricePaise: number, mrpPaise: number | null | undefined): number | null {
  if (!mrpPaise || mrpPaise <= pricePaise) {
    return null;
  }
  const percent = Math.floor(((mrpPaise - pricePaise) * 100) / mrpPaise);
  return percent > 0 ? percent : null;
}

export function stockLabel(stock: { quantity: number; purchasable: boolean }): string {
  if (!stock.purchasable) {
    return "Out of stock";
  }
  return stock.quantity === 1 ? "1 in stock" : `${stock.quantity} in stock`;
}

export function toCardProduct(product: {
  id: string;
  name: string;
  brand: string | null;
  descriptionSummary: string | null;
  packageLabel: string;
  pricePaise: number;
  mrpPaise?: number | null;
  stock: { purchasable: boolean };
  primaryImage: { deliveryPath: string; altText: string | null } | null;
}): CatalogueCardProduct {
  return {
    id: product.id,
    name: product.name,
    detail: product.brand ?? product.descriptionSummary ?? "",
    unit: product.packageLabel,
    pricePaise: product.pricePaise,
    mrpPaise: product.mrpPaise ?? null,
    discountPercent: discountPercent(product.pricePaise, product.mrpPaise),
    deliveryPath: product.primaryImage?.deliveryPath ?? null,
    imageAlt: product.primaryImage?.altText ?? null,
    purchasable: product.stock.purchasable,
  };
}

export const sortOptions = [
  { value: "name", label: "Name" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
] as const;
