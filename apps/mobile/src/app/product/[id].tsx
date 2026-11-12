import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { offerFromDetail } from "@/cart/quotes";
import { useCartQuantity } from "@/cart/use-cart-lines";
import { productCardCartMode } from "@/cart/view";
import { useCartStore } from "@/state/cart";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueImage } from "@/components/CatalogueImage";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { LiveDot } from "@/components/LiveDot";
import { ProductDetailSkeleton } from "@/components/Skeleton";
import { tapAddToCart, warnCartRefused } from "@/feedback/haptics";
import { PageHeader } from "@/components/PageHeader";
import { QuantitySelector } from "@/components/QuantitySelector";
import { ScreenContainer } from "@/components/ScreenContainer";
import { discountPercent, galleryIndexFromOffset, stockLabel } from "@/catalogue/display";
import { placeholderLocation } from "@/location/placeholder-location";
import { homeChrome } from "@/presentation/home";
import { useProduct } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";

const galleryHeight = 300;

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
  const gallery = useRef<ComponentRef<typeof ScrollView>>(null);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const detail = product.data;
  const subtitle = `${homeChrome.etaLabel} · ${location.label}, ${location.line}`;
  const mode = detail ? productCardCartMode(detail, quantity) : null;
  const discount = detail ? discountPercent(detail.pricePaise, detail.mrpPaise) : null;
  const inStock = mode?.kind === "controls";
  const description = detail?.description?.trim() ?? "";
  const brand = detail?.brand?.trim() ?? "";

  function changeQuantity(next: number) {
    if (!detail) {
      return;
    }
    const result = applyItemQuantity(offerFromDetail(detail), next);
    if (!result.ok) {
      warnCartRefused();
    }
    setCartMessage(result.ok ? null : result.error.message);
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader variant="title" title="Product details" subtitle={subtitle} onBack={() => router.back()} />
      {product.isPending ? <ProductDetailSkeleton width={width} /> : null}
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
        <ScrollView className="flex-1 bg-page" contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <View className="border-b border-line bg-white" style={{ height: galleryHeight }}>
            {detail.images.length > 0 ? (
              <ScrollView
                ref={gallery}
                horizontal
                pagingEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={detail.images.length > 1}
                onMomentumScrollEnd={(event) => {
                  setImageIndex(galleryIndexFromOffset(event.nativeEvent.contentOffset.x, width, detail.images.length));
                }}
              >
                {detail.images.map((image) => (
                  <CatalogueImage
                    key={image.id}
                    deliveryPath={image.deliveryPath}
                    alt={image.altText ?? detail.name}
                    style={{ width, height: galleryHeight }}
                  />
                ))}
              </ScrollView>
            ) : (
              <CatalogueImage deliveryPath={null} alt={detail.name} style={{ width, height: galleryHeight }} />
            )}
            {discount ? (
              <View className="absolute left-5 top-4 rounded-lg bg-lime px-2 py-1">
                <AppText family="body" weight="extrabold" className="text-[11px] text-ink">
                  {`${discount}% OFF`}
                </AppText>
              </View>
            ) : null}
            {detail.images.length > 1 ? (
              <View className="absolute bottom-3 w-full flex-row items-center justify-center gap-1">
                {detail.images.map((image, index) => (
                  <Pressable
                    key={image.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${index + 1}`}
                    onPress={() => {
                      setImageIndex(index);
                      gallery.current?.scrollTo({ x: index * width, animated: true });
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
            <View className="flex-row items-center justify-between gap-3">
              <View className="shrink rounded-full border border-line bg-white px-3 py-1">
                <AppText family="body" weight="semibold" className="text-[11px] text-secondary" numberOfLines={1}>
                  {detail.category.name}
                </AppText>
              </View>
              <View className="flex-row items-center gap-2">
                <LiveDot color={inStock ? colors.savings : colors.muted} live={inStock} />
                <AppText family="body" weight="semibold" className={`text-[12px] ${inStock ? "text-savings" : "text-secondary"}`}>
                  {mode?.kind === "unavailable" ? mode.label : stockLabel(detail.stock)}
                </AppText>
              </View>
            </View>

            <View className="gap-1">
              {brand ? (
                <AppText family="body" weight="bold" className="text-[11px] uppercase tracking-wide text-secondary">
                  {brand}
                </AppText>
              ) : null}
              <AppText family="body" weight="bold" className="text-[19px] leading-[25px] text-ink">
                {detail.name}
              </AppText>
            </View>

            <View className="rounded-xl border border-line bg-white px-4 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="shrink gap-0.5">
                  <View className="flex-row flex-wrap items-baseline gap-x-2">
                    <AppText family="body" weight="extrabold" className="text-[20px] text-ink">
                      {formatRupees(detail.pricePaise)}
                    </AppText>
                    {discount && detail.mrpPaise ? (
                      <AppText family="body" weight="regular" className="text-[12px] text-muted line-through">
                        {`MRP ${formatRupees(detail.mrpPaise)}`}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText family="body" weight="regular" className="text-[11px] text-muted">
                    {discount && detail.mrpPaise ? (
                      <AppText family="body" weight="bold" className="text-[11px] text-savings">
                        {`Save ${formatRupees(detail.mrpPaise - detail.pricePaise)} · `}
                      </AppText>
                    ) : null}
                    Inclusive of all taxes
                  </AppText>
                </View>
                {detail.packageLabel ? (
                  <View className="max-w-[45%] items-end">
                    <AppText family="body" weight="regular" className="text-[10px] uppercase tracking-wide text-muted">
                      Pack
                    </AppText>
                    <AppText family="body" weight="semibold" className="mt-0.5 text-right text-[13px] text-ink">
                      {detail.packageLabel}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <View className="my-3 h-px bg-line" />
              {mode?.kind === "controls" ? (
                quantity > 0 ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="shrink">
                      <AppText family="body" weight="extrabold" className="text-[15px] text-ink">
                        {formatRupees(detail.pricePaise * quantity)}
                      </AppText>
                      <AppText family="body" weight="regular" className="mt-0.5 text-[11px] text-secondary">
                        {`${quantity} in your cart`}
                      </AppText>
                    </View>
                    <QuantitySelector quantity={quantity} maxQuantity={mode.maxQuantity} onChange={changeQuantity} />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add to cart"
                    onPress={() => {
                      tapAddToCart();
                      changeQuantity(1);
                    }}
                    className="h-11 flex-row items-center justify-center gap-2 rounded-lg bg-lime active:opacity-80"
                  >
                    <Plus color={colors.ink} size={16} strokeWidth={2.6} />
                    <AppText family="display" weight="extrabold" className="text-[14px] text-ink">
                      Add to cart
                    </AppText>
                  </Pressable>
                )
              ) : (
                <View className="flex-row items-center justify-between gap-3">
                  <AppText family="body" weight="semibold" className="text-[13px] text-secondary">
                    {mode?.label ?? "Unavailable"}
                  </AppText>
                  {quantity > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => {
                        remove(productId);
                        setCartMessage(null);
                      }}
                    >
                      <AppText family="body" weight="semibold" className="text-[12px] text-ink underline">
                        Remove from cart
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {cartMessage ? (
                <AppText family="body" weight="regular" className="mt-2 text-[12px] text-secondary">
                  {cartMessage}
                </AppText>
              ) : null}
            </View>
          </View>

          {description ? (
            <Section title="About this product">
              <View className="rounded-xl border border-line bg-white p-4">
                <AppText family="body" weight="regular" className="text-[13px] leading-[21px] text-secondary">
                  {description}
                </AppText>
              </View>
            </Section>
          ) : null}
        </ScrollView>
      ) : null}
      <BasketBar />
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mx-5 mt-6">
      <AppText family="display" weight="bold" className="mb-2.5 text-[13px] uppercase tracking-wide text-ink">
        {title}
      </AppText>
      {children}
    </View>
  );
}
