import { Timer } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { CatalogueImage } from "@/components/CatalogueImage";
import { QuantitySelector } from "@/components/QuantitySelector";
import type { CatalogueCardProduct } from "@/catalogue/display";
import { homeChrome } from "@/presentation/home";
import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";

type ProductCardProps = {
  product: CatalogueCardProduct;
  quantity: number;
  maxQuantity?: number;
  unavailableLabel?: string;
  width: number;
  onPress: () => void;
  onQuantityChange: (quantity: number) => void;
};

// Every line of text has an explicit line height. Android otherwise measures custom fonts
// slightly short, and stacked lines can draw over each other.
export function ProductCard({
  product,
  quantity,
  maxQuantity,
  unavailableLabel,
  width,
  onPress,
  onQuantityChange,
}: ProductCardProps) {
  const purchasable = product.purchasable && !unavailableLabel;
  const showMrp = Boolean(product.discountPercent && product.mrpPaise);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={onPress}
      style={{ width }}
      className="rounded-2xl border border-line bg-white p-2 shadow-card active:opacity-90"
    >
      <View className="h-[112px] items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-1.5">
        <CatalogueImage deliveryPath={product.deliveryPath} alt={product.imageAlt} />
        {product.discountPercent ? (
          <View className="absolute left-0 top-0 items-center rounded-br-lg bg-lime px-1.5 py-1">
            <AppText family="display" weight="extrabold" className="text-[11px] leading-[12px] text-ink">
              {`${product.discountPercent}%`}
            </AppText>
            <AppText family="display" weight="bold" className="text-[9px] leading-[10px] text-ink">
              OFF
            </AppText>
          </View>
        ) : null}
        {!purchasable ? (
          <View className="absolute inset-0 items-center justify-center bg-white/60">
            <View className="rounded-md bg-ink px-2 py-1">
              <AppText family="body" weight="bold" className="text-[10px] leading-[13px] text-white">
                {unavailableLabel ?? "Out of stock"}
              </AppText>
            </View>
          </View>
        ) : null}
      </View>

      <View className="mt-2 px-0.5">
        <View className="flex-row items-center gap-1 self-start rounded-md bg-savings-wash px-1.5 py-0.5">
          <Timer color={colors.savings} size={11} strokeWidth={2.4} />
          <AppText family="body" weight="bold" className="text-[9px] leading-[12px] text-savings">
            {homeChrome.cardEtaLabel}
          </AppText>
        </View>
        {/* Two lines tall even for short names, so cards in a row line up. */}
        <AppText
          family="body"
          weight="semibold"
          className="mt-1.5 min-h-[34px] text-[13px] leading-[17px] text-ink"
          numberOfLines={2}
        >
          {product.name}
        </AppText>
        <AppText family="body" weight="regular" className="mt-0.5 text-[11px] leading-[15px] text-muted" numberOfLines={1}>
          {product.unit || " "}
        </AppText>
      </View>

      <View className="mt-2 flex-row items-end justify-between gap-2 px-0.5">
        <View className="min-w-0 shrink">
          <AppText family="body" weight="extrabold" className="text-[15px] leading-[19px] text-ink" numberOfLines={1}>
            {formatRupees(product.pricePaise)}
          </AppText>
          {/* Reserve the MRP line so prices sit at the same height across a row. */}
          <AppText
            family="body"
            weight="regular"
            className={`text-[11px] leading-[14px] text-muted ${showMrp ? "line-through" : ""}`}
            numberOfLines={1}
          >
            {showMrp && product.mrpPaise ? formatRupees(product.mrpPaise) : " "}
          </AppText>
        </View>
        {purchasable ? (
          <QuantitySelector quantity={quantity} maxQuantity={maxQuantity} onChange={onQuantityChange} />
        ) : null}
      </View>
    </Pressable>
  );
}
