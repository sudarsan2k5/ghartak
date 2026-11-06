import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { offerFromDetail } from "@/cart/quotes";
import { useCartQuantity } from "@/cart/use-cart-lines";
import { productCardCartMode } from "@/cart/view";
import { useCartStore } from "@/state/cart";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueImage } from "@/components/CatalogueImage";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { QuantitySelector } from "@/components/QuantitySelector";
import { ScreenContainer } from "@/components/ScreenContainer";
import { stockLabel } from "@/catalogue/display";
import { placeholderLocation } from "@/location/placeholder-location";
import { homeChrome } from "@/presentation/home";
import { useProduct } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";

export default function ProductDetailsScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = typeof id === "string" ? id : "";
  const product = useProduct(productId);
  const quantity = useCartQuantity(productId);
  const applyItemQuantity = useCartStore((state) => state.applyItemQuantity);
  const remove = useCartStore((state) => state.remove);
  const [imageIndex, setImageIndex] = useState(0);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const detail = product.data;
  const subtitle = `${homeChrome.etaLabel} · ${location.label}, ${location.line}`;
  const mode = detail ? productCardCartMode(detail, quantity) : null;

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader variant="title" title="Product details" subtitle={subtitle} onBack={() => router.back()} />
      {product.isPending ? <LoadingIndicator /> : null}
      {product.isError ? (
        <CatalogueStatus
          title="This product could not be loaded."
          actionLabel="Try again"
          onAction={() => {
            void product.refetch();
          }}
        />
      ) : null}
      {detail === null ? (
        <CatalogueStatus title="This product is not available." actionLabel="Go back" onAction={() => router.back()} />
      ) : null}
      {detail ? (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <View className="border-b border-line bg-white" style={{ height: 252 }}>
            <CatalogueImage
              deliveryPath={detail.images[imageIndex]?.deliveryPath ?? detail.primaryImage?.deliveryPath ?? null}
              alt={detail.images[imageIndex]?.altText ?? detail.name}
              style={{ width, height: 252 }}
            />
            {detail.images.length > 1 ? (
              <View className="absolute bottom-3 w-full flex-row items-center justify-center gap-1">
                {detail.images.map((image, index) => (
                  <Pressable
                    key={image.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${index + 1}`}
                    onPress={() => {
                      setImageIndex(index);
                    }}
                    style={{
                      width: index === imageIndex ? 16 : 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: index === imageIndex ? colors.ink : colors.line,
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
          <View className="gap-4 px-5 pt-5">
            {detail.brand ? (
              <AppText family="inter" weight="bold" className="text-[11px] uppercase text-secondary">
                {detail.brand}
              </AppText>
            ) : null}
            <AppText family="inter" weight="extrabold" className="text-[26px] leading-[1.1] text-ink">
              {detail.name}
            </AppText>
            {detail.description ? (
              <AppText family="inter" weight="regular" className="text-[12px] leading-5 text-secondary">
                {detail.description}
              </AppText>
            ) : null}
            <View className="flex-row items-end justify-between">
              <AppText family="inter" weight="extrabold" className="text-[26px] text-ink">
                {formatRupees(detail.pricePaise)}
              </AppText>
              <AppText family="inter" weight="regular" className="text-[12px] text-muted">
                {detail.packageLabel}
              </AppText>
            </View>
            <AppText
              family="inter"
              weight="semibold"
              className={`text-[13px] ${mode?.kind === "controls" ? "text-ink" : "text-secondary"}`}
            >
              {mode?.kind === "unavailable" ? mode.label : stockLabel(detail.stock)}
            </AppText>
            {detail.attributes.length > 0 ? (
              <View className="gap-2 border-t border-line pt-4">
                <AppText family="inter" weight="extrabold" className="text-[15px] uppercase text-ink">
                  Good to know
                </AppText>
                {detail.attributes.map((attribute) => (
                  <AppText
                    key={`${attribute.position}-${attribute.name}`}
                    family="inter"
                    weight="regular"
                    className="text-[12px] leading-5 text-secondary"
                  >
                    {`${attribute.name}: ${attribute.value}`}
                  </AppText>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
      {detail ? (
        <View className="border-t border-line bg-white px-5 py-3">
          {mode?.kind === "controls" ? (
            <View className="flex-row items-center justify-between">
              <View>
                <AppText family="inter" weight="semibold" className="text-[13px] text-ink">
                  {quantity > 0 ? "In your cart" : "Add to cart"}
                </AppText>
                {quantity > 0 ? (
                  <AppText family="inter" weight="regular" className="mt-0.5 text-[11px] text-muted">
                    {`${formatRupees(detail.pricePaise)} each`}
                  </AppText>
                ) : null}
              </View>
              <QuantitySelector
                quantity={quantity}
                maxQuantity={mode.maxQuantity}
                onChange={(next) => {
                  const result = applyItemQuantity(offerFromDetail(detail), next);
                  setCartMessage(result.ok ? null : result.error.message);
                }}
              />
            </View>
          ) : (
            <View className="flex-row items-center justify-between">
              <AppText family="inter" weight="semibold" className="text-[13px] text-secondary">
                {mode?.label ?? "Unavailable"}
              </AppText>
              {quantity > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    remove(productId);
                    setCartMessage(null);
                  }}
                >
                  <AppText family="inter" weight="semibold" className="text-[12px] text-ink">
                    Remove from cart
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          )}
          {cartMessage ? (
            <AppText family="inter" weight="regular" className="mt-2 text-[12px] text-secondary">
              {cartMessage}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <BasketBar />
    </ScreenContainer>
  );
}
