import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, ShoppingBag } from "lucide-react-native";
import { useCallback } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

import { CatalogueImage } from "@/components/CatalogueImage";
import { DeliveryStrip } from "@/components/DeliveryStrip";
import { PageHeader } from "@/components/PageHeader";
import { PriceText } from "@/components/PriceText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { QuantitySelector } from "@/components/QuantitySelector";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useCartLines, type CartLine } from "@/cart/use-cart-lines";
import { cartLinePresentation, checkoutReadiness } from "@/cart/view";
import { catalogueKeys } from "@/query/catalogue";
import { warnCartRefused } from "@/feedback/haptics";
import { placeholderLocation } from "@/location/placeholder-location";
import { deliveryMinutes } from "@/presentation/home";
import { useCartStore } from "@/state/cart";
import { AppText } from "@/theme/AppText";
import { guestCheckoutCopy } from "@/cart/guest-checkout";
import { discountPercent } from "@/catalogue/display";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";

export default function CartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCartLines();
  const { lines, itemCount } = cart;
  const readiness = checkoutReadiness({
    itemCount,
    subtotalPaise: cart.subtotalPaise,
    lines,
  });
  const applyItemQuantity = useCartStore((state) => state.applyItemQuantity);
  const remove = useCartStore((state) => state.remove);
  const clear = useCartStore((state) => state.clear);
  const location = placeholderLocation();

  useFocusEffect(
    useCallback(() => {
      const ids = useCartStore.getState().items.map((item) => item.productId);
      for (const id of ids) {
        void queryClient.invalidateQueries({ queryKey: catalogueKeys.product(id) });
      }
    }, [queryClient]),
  );

  function confirmClear() {
    Alert.alert("Clear cart?", "This removes every item from your cart.", [
      { text: "Keep items", style: "cancel" },
      {
        text: "Clear cart",
        style: "destructive",
        onPress: () => {
          clear();
        },
      },
    ]);
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader
        variant="title"
        title="Your cart"
        subtitle={lines.length === 0 ? "Ghartak" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        onBack={() => router.back()}
      />
      {lines.length === 0 ? (
        <EmptyCart
          onShop={() => {
            router.replace("/");
          }}
        />
      ) : (
        <>
          <DeliveryStrip minutes={deliveryMinutes} place={location.label} />
          <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            <View className="rounded-[18px] border border-line bg-white px-3.5 pt-3.5">
              <View className="mb-3 flex-row items-end justify-between px-0.5">
                <AppText family="display" weight="extrabold" className="text-[16px] text-ink">
                  The everyday good stuff
                </AppText>
                <AppText family="body" weight="regular" className="text-[11px] text-secondary">
                  {`${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                </AppText>
              </View>
              {lines.map((line, index) => (
                <CartRow
                  key={line.item.productId}
                  line={line}
                  last={index === lines.length - 1}
                  onQuantity={(quantity) => {
                    if (!line.offer) {
                      return;
                    }
                    const result = applyItemQuantity(line.offer, quantity);
                    if (!result.ok) {
                      warnCartRefused();
                    }
                  }}
                  onRemove={() => {
                    remove(line.item.productId);
                  }}
                  onRetry={() => {
                    void queryClient.invalidateQueries({ queryKey: catalogueKeys.product(line.item.productId) });
                  }}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  router.replace("/");
                }}
                className="h-[35px] flex-row items-center justify-between border-t border-line"
              >
                <AppText family="body" weight="semibold" className="text-[13px] text-ink">
                  Add more items
                </AppText>
                <Plus color={colors.ink} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={confirmClear} className="mt-3 py-2">
              <AppText family="body" weight="semibold" className="text-[13px] text-secondary">
                Clear cart
              </AppText>
            </Pressable>
            <BillDetails
              ready={readiness.subtotalPaise !== null}
              subtotalPaise={readiness.subtotalPaise}
              savingsPaise={cart.savingsPaise}
              pendingLabel={readiness.code === "confirming" ? "Checking current prices…" : readiness.reason}
            />
          </ScrollView>
          {!readiness.ready && readiness.subtotalPaise !== null ? (
            <View className="border-t border-line bg-white px-5 pt-2.5">
              <AppText family="body" weight="semibold" className="text-[12px] leading-[16px] text-secondary">
                {readiness.reason}
              </AppText>
            </View>
          ) : null}
          <View
            className={`flex-row items-center gap-3 bg-white px-5 pb-3 pt-3 ${
              !readiness.ready && readiness.subtotalPaise !== null ? "" : "border-t border-line"
            }`}
          >
            <View className="min-w-[96px]">
              {readiness.subtotalPaise !== null ? (
                <>
                  <AppText family="body" weight="extrabold" className="text-[17px] leading-[22px] text-ink">
                    {formatRupees(readiness.subtotalPaise, { fractionDigits: 2 })}
                  </AppText>
                  {cart.savingsPaise > 0 ? (
                    <AppText family="body" weight="bold" className="text-[11px] leading-[14px] text-savings">
                      {`Saved ${formatRupees(cart.savingsPaise, { fractionDigits: 2 })}`}
                    </AppText>
                  ) : (
                    <AppText family="body" weight="regular" className="text-[11px] leading-[14px] text-muted">
                      Subtotal
                    </AppText>
                  )}
                </>
              ) : (
                <AppText family="body" weight="semibold" className="text-[12px] leading-[16px] text-secondary">
                  {readiness.code === "confirming" ? "Checking prices" : "Review cart"}
                </AppText>
              )}
            </View>
            <View className="flex-1">
              <PrimaryButton
                label="Proceed to checkout"
                disabled={!readiness.ready}
                onPress={() => {
                  if (readiness.ready) {
                    router.push("/checkout");
                  }
                }}
              />
            </View>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function BillDetails({
  ready,
  subtotalPaise,
  savingsPaise,
  pendingLabel,
}: {
  ready: boolean;
  subtotalPaise: number | null;
  savingsPaise: number;
  pendingLabel: string;
}) {
  return (
    <View className="mt-3 rounded-[18px] border border-line bg-white px-4 py-4">
      <AppText family="display" weight="bold" className="mb-3 text-[16px] leading-[21px] text-ink">
        Bill details
      </AppText>
      {ready && subtotalPaise !== null ? (
        <View className="gap-2.5">
          {savingsPaise > 0 ? (
            <>
              <BillRow label="Item total (MRP)" value={formatRupees(subtotalPaise + savingsPaise, { fractionDigits: 2 })} />
              <BillRow label="Product discount" value={`−${formatRupees(savingsPaise, { fractionDigits: 2 })}`} tone="savings" />
            </>
          ) : null}
          <BillRow label="Subtotal" value={formatRupees(subtotalPaise, { fractionDigits: 2 })} />
          <BillRow label="Delivery fee" value="At checkout" tone="muted" />
          <View className="my-0.5 h-px bg-line" />
          <BillRow label="To pay now" value={formatRupees(subtotalPaise, { fractionDigits: 2 })} strong />
          <AppText family="body" weight="regular" className="text-[11px] leading-[16px] text-muted">
            {guestCheckoutCopy.deliveryPending}
          </AppText>
          {savingsPaise > 0 ? (
            <View className="mt-1 items-center rounded-lg bg-savings-wash px-3 py-2">
              <AppText family="body" weight="bold" className="text-[12px] leading-[16px] text-savings">
                {`You are saving ${formatRupees(savingsPaise, { fractionDigits: 2 })} on this order`}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <AppText family="body" weight="regular" className="text-[13px] leading-[19px] text-secondary">
          {pendingLabel}
        </AppText>
      )}
    </View>
  );
}

function BillRow({
  label,
  value,
  tone = "ink",
  strong = false,
}: {
  label: string;
  value: string;
  tone?: "ink" | "savings" | "muted";
  strong?: boolean;
}) {
  const valueColor = tone === "savings" ? "text-savings" : tone === "muted" ? "text-muted" : "text-ink";
  return (
    <View className="flex-row items-center justify-between gap-3">
      <AppText
        family="body"
        weight={strong ? "extrabold" : "regular"}
        className={`${strong ? "text-[14px] leading-[19px] text-ink" : "text-[13px] leading-[18px] text-secondary"}`}
      >
        {label}
      </AppText>
      <AppText
        family="body"
        weight={strong ? "extrabold" : "semibold"}
        className={`${strong ? "text-[15px] leading-[20px]" : "text-[13px] leading-[18px]"} ${valueColor}`}
      >
        {value}
      </AppText>
    </View>
  );
}

function EmptyCart({ onShop }: { onShop: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-lime">
        <ShoppingBag color={colors.ink} size={28} strokeWidth={2} />
      </View>
      <AppText family="body" weight="black" className="text-[27px] text-ink">
        Ghartak
      </AppText>
      <AppText family="display" weight="extrabold" className="text-center text-[20px] text-ink">
        Your cart is empty
      </AppText>
      <AppText family="body" weight="regular" className="text-center text-[14px] leading-6 text-secondary">
        Add dal, milk, and the rest of the day’s list. Your basket is saved on this device until you are ready.
      </AppText>
      <SecondaryButton label="Continue shopping" onPress={onShop} />
    </View>
  );
}

function CartRow({
  line,
  last,
  onQuantity,
  onRemove,
  onRetry,
}: {
  line: CartLine;
  last: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const title = line.offer?.name ?? line.item.display?.name ?? "Product";
  const pack = line.offer?.packageLabel ?? line.item.display?.packageLabel ?? "";
  const path = line.offer?.deliveryPath ?? line.item.display?.deliveryPath ?? null;
  const presentation = cartLinePresentation(line.item.quantity, line.status);
  const maxQuantity = line.offer?.stock.quantity ?? presentation.stockQuantity ?? undefined;
  const mrpPaise = line.offer?.mrpPaise ?? null;
  const percentOff = presentation.unitPricePaise !== null ? discountPercent(presentation.unitPricePaise, mrpPaise) : null;
  const showMrp = percentOff !== null;

  return (
    <View className={last ? "pb-3" : "border-b border-line pb-3 mb-3"}>
      <View className="flex-row gap-2.5">
        <View className="h-[55px] w-[52px] overflow-hidden rounded-lg bg-page">
          <CatalogueImage deliveryPath={path} alt={title} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="min-w-0 flex-1">
              <AppText family="body" weight="bold" className="text-[13px] text-ink" numberOfLines={2}>
                {title}
              </AppText>
              {pack ? (
                <AppText family="body" weight="regular" className="mt-0.5 text-[10px] text-muted">
                  {pack}
                </AppText>
              ) : null}
            </View>
            {presentation.lineTotalPaise !== null ? (
              <View className="items-end">
                <PriceText paise={presentation.lineTotalPaise} fractionDigits={2} />
                {showMrp && mrpPaise !== null ? (
                  <AppText family="body" weight="regular" className="text-[11px] leading-[14px] text-muted line-through">
                    {formatRupees(mrpPaise * line.item.quantity, { fractionDigits: 2 })}
                  </AppText>
                ) : null}
              </View>
            ) : line.status.kind === "loading" ? (
              <AppText family="body" weight="semibold" className="text-[12px] text-muted">
                …
              </AppText>
            ) : null}
          </View>
          {presentation.unitPricePaise !== null ? (
            <View className="mt-1 flex-row flex-wrap items-center gap-x-1.5">
              <AppText family="body" weight="regular" className="text-[11px] leading-[14px] text-muted">
                {`${formatRupees(presentation.unitPricePaise, { fractionDigits: 2 })} each`}
              </AppText>
              {showMrp && mrpPaise !== null ? (
                <>
                  <AppText family="body" weight="regular" className="text-[11px] leading-[14px] text-muted line-through">
                    {formatRupees(mrpPaise, { fractionDigits: 2 })}
                  </AppText>
                  <AppText family="body" weight="bold" className="text-[11px] leading-[14px] text-savings">
                    {`${percentOff}% off`}
                  </AppText>
                </>
              ) : null}
            </View>
          ) : null}
          {presentation.stockQuantity !== null && line.status.kind === "over_stock" ? (
            <AppText family="body" weight="regular" className="mt-1 text-[11px] text-secondary">
              {`${presentation.stockQuantity} in stock now`}
            </AppText>
          ) : null}
          {presentation.message ? (
            <AppText family="body" weight="regular" className="mt-1.5 text-[12px] leading-5 text-secondary">
              {presentation.message}
            </AppText>
          ) : null}
          <View className="mt-2.5 flex-row items-center justify-between">
            {presentation.allowQuantityChange ? (
              <QuantitySelector quantity={line.item.quantity} maxQuantity={maxQuantity} onChange={onQuantity} />
            ) : (
              <AppText family="body" weight="regular" className="text-[12px] text-muted">
                {`Qty ${line.item.quantity}`}
              </AppText>
            )}
            <View className="flex-row items-center gap-3">
              {presentation.allowRetry ? (
                <Pressable accessibilityRole="button" onPress={onRetry}>
                  <AppText family="body" weight="semibold" className="text-[12px] text-ink">
                    Try again
                  </AppText>
                </Pressable>
              ) : null}
              {presentation.allowRemove ? (
                <Pressable accessibilityRole="button" onPress={onRemove}>
                  <AppText family="body" weight="semibold" className="text-[12px] text-secondary">
                    Remove
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
