export type CatalogueCardProduct = {
  id: string;
  name: string;
  detail: string;
  unit: string;
  pricePaise: number;
  deliveryPath: string | null;
  imageAlt: string | null;
  purchasable: boolean;
};

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
  stock: { purchasable: boolean };
  primaryImage: { deliveryPath: string; altText: string | null } | null;
}): CatalogueCardProduct {
  return {
    id: product.id,
    name: product.name,
    detail: product.brand ?? product.descriptionSummary ?? "",
    unit: product.packageLabel,
    pricePaise: product.pricePaise,
    deliveryPath: product.primaryImage?.deliveryPath ?? null,
    imageAlt: product.primaryImage?.altText ?? null,
    purchasable: product.stock.purchasable,
  };
}
