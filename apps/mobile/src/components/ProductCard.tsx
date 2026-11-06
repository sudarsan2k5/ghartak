import { Pressable, View } from "react-native";

import { CatalogueImage } from "@/components/CatalogueImage";
import { PriceText } from "@/components/PriceText";
import { QuantitySelector } from "@/components/QuantitySelector";
import type { CatalogueCardProduct } from "@/catalogue/display";
import { AppText } from "@/theme/AppText";

type ProductCardProps = {
  product: CatalogueCardProduct;
  quantity: number;
  maxQuantity?: number;
  unavailableLabel?: string;
  width: number;
  onPress: () => void;
  onQuantityChange: (quantity: number) => void;
};

export function ProductCard({
  product,
  quantity,
  maxQuantity,
  unavailableLabel,
  width,
  onPress,
  onQuantityChange,
}: ProductCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={onPress}
      style={{ width }}
      className="rounded-xl border border-line bg-white p-2.5"
    >
      <View className="relative h-[104px] items-center justify-center overflow-hidden">
        <CatalogueImage deliveryPath={product.deliveryPath} alt={product.imageAlt} />
      </View>
      <View className="mt-[7px] gap-[7px]">
        <View>
          <AppText family="inter" weight="extrabold" className="text-[12px] text-ink" numberOfLines={1}>
            {product.name}
          </AppText>
          <AppText family="inter" weight="extrabold" className="text-[12px] text-ink" numberOfLines={1}>
            {product.detail}
          </AppText>
        </View>
        <AppText family="inter" weight="regular" className="text-[10px] text-muted" numberOfLines={1}>
          {product.unit}
        </AppText>
        <View className="flex-row items-end justify-between">
          <PriceText paise={product.pricePaise} />
          {product.purchasable && !unavailableLabel ? (
            <QuantitySelector quantity={quantity} maxQuantity={maxQuantity} onChange={onQuantityChange} />
          ) : (
            <AppText family="inter" weight="semibold" className="text-[10px] text-secondary">
              {unavailableLabel ?? "Out of stock"}
            </AppText>
          )}
        </View>
      </View>
    </Pressable>
  );
}
