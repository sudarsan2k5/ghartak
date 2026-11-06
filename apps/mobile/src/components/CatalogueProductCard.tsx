import type { CatalogueProductSummary } from "@ghartak/contracts";
import { useRouter } from "expo-router";

import { offerFromCatalogue } from "@/cart/quotes";
import { useCartQuantity } from "@/cart/use-cart-lines";
import { productCardCartMode } from "@/cart/view";
import { toCardProduct } from "@/catalogue/display";
import { ProductCard } from "@/components/ProductCard";
import { useCartStore } from "@/state/cart";

type CatalogueProductCardProps = {
  product: CatalogueProductSummary;
  width: number;
};

export function CatalogueProductCard({ product, width }: CatalogueProductCardProps) {
  const router = useRouter();
  const quantity = useCartQuantity(product.id);
  const applyItemQuantity = useCartStore((state) => state.applyItemQuantity);
  const mode = productCardCartMode(product, quantity);

  return (
    <ProductCard
      product={toCardProduct(product)}
      width={width}
      quantity={quantity}
      maxQuantity={mode.kind === "controls" ? mode.maxQuantity : 0}
      unavailableLabel={mode.kind === "unavailable" ? mode.label : undefined}
      onPress={() => {
        router.push({ pathname: "/product/[id]", params: { id: product.id } });
      }}
      onQuantityChange={(next) => {
        applyItemQuantity(offerFromCatalogue(product), next);
      }}
    />
  );
}
