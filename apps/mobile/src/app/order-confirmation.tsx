import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import {
  formatOrderTime,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  readPlacedOrder,
} from "@/cart/placed-order";
import {
  readTrackingPersistError,
  saveTrackingCredential,
} from "@/tracking/credentials";
import { trackingCopy } from "@/tracking/copy";
import { PageHeader } from "@/components/PageHeader";
import { PriceText } from "@/components/PriceText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";

export default function OrderConfirmationScreen() {
  const router = useRouter();
  const order = readPlacedOrder();
  const [persistError, setPersistError] = useState<string | null>(() => readTrackingPersistError());
  const [saving, setSaving] = useState(false);

  function goHome() {
    router.replace("/");
  }

  if (!order) {
    return (
      <ScreenContainer edges={["top", "bottom"]}>
        <PageHeader variant="title" title="Order placed" />
        <View className="flex-1 items-center justify-center px-8">
          <AppText family="display" weight="extrabold" className="text-center text-[20px] text-ink">
            Order details are not on this device
          </AppText>
          <AppText family="body" weight="regular" className="mt-3 text-center text-[14px] leading-6 text-secondary">
            The confirmation is shown only after a successful checkout on this phone.
          </AppText>
          <View className="mt-6 w-full">
            <PrimaryButton label="Return to Home" onPress={goHome} />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader variant="title" title="Order placed" />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View className="mt-2 items-center rounded-[18px] border border-line bg-white px-5 py-7">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-lime">
            <Check color={colors.ink} size={34} strokeWidth={2.4} />
          </View>
          <AppText family="display" weight="extrabold" className="mt-4 text-center text-[22px] text-ink">
            Order placed successfully
          </AppText>
          <AppText family="body" weight="regular" className="mt-2 text-center text-[13px] leading-5 text-secondary">
            Pay in cash when it is delivered. Keep this order number.
          </AppText>
          <AppText family="body" weight="extrabold" className="mt-4 text-[18px] text-ink">
            {order.orderNumber}
          </AppText>
        </View>

        <View className="mt-4 rounded-[18px] border border-line bg-white px-4 py-4">
          <Fact label="Status" value={orderStatusLabel(order.status)} />
          <Fact label="Payment method" value={paymentMethodLabel(order.paymentMethod)} />
          <Fact label="Payment status" value={paymentStatusLabel(order.paymentStatus)} />
          <Fact label="Customer" value={order.customerName} />
          <Fact label="Placed" value={formatOrderTime(order.createdAt)} last />
        </View>

        <View className="mt-4 rounded-[18px] border border-line bg-white px-4 py-4">
          <AppText family="display" weight="extrabold" className="mb-3 text-[16px] text-ink">
            Items
          </AppText>
          {order.items.map((item) => (
            <View key={`${item.productId}-${item.quantity}`} className="flex-row justify-between gap-3 py-2">
              <View className="min-w-0 flex-1">
                <AppText family="body" weight="bold" className="text-[13px] text-ink">
                  {item.productName}
                </AppText>
                <AppText family="body" weight="regular" className="mt-0.5 text-[11px] text-muted">
                  {`Qty ${item.quantity}`}
                </AppText>
              </View>
              <View className="items-end">
                <PriceText paise={item.lineTotalPaise} fractionDigits={2} />
                <AppText family="body" weight="regular" className="mt-0.5 text-[10px] text-muted">
                  {`${formatRupees(item.unitPricePaise, { fractionDigits: 2 })} each`}
                </AppText>
              </View>
            </View>
          ))}
          <View className="mt-2 border-t border-line pt-3">
            <BillRow label="Subtotal" paise={order.subtotalPaise} />
            <BillRow label="Delivery fee" paise={order.deliveryFeePaise} />
            <View className="mt-2 flex-row items-center justify-between">
              <AppText family="display" weight="extrabold" className="text-[15px] text-ink">
                Total
              </AppText>
              <PriceText paise={order.totalPaise} size="total" fractionDigits={2} />
            </View>
          </View>
        </View>
      </ScrollView>
      {persistError ? (
        <View className="mx-5 mb-2 rounded-xl border border-line bg-white px-4 py-3" accessibilityRole="alert">
          <AppText family="body" weight="regular" className="text-[13px] leading-5 text-secondary">
            {persistError}
          </AppText>
        </View>
      ) : null}
      <View className="gap-3 border-t border-line bg-white px-5 py-4">
        <PrimaryButton
          tone="lime"
          label={trackingCopy.trackAction}
          onPress={() => {
            router.push("/order-tracking");
          }}
        />
        {persistError ? (
          <SecondaryButton
            label={saving ? "Saving" : trackingCopy.persistRetry}
            onPress={() => {
              if (saving) {
                return;
              }
              setSaving(true);
              void saveTrackingCredential({
                orderNumber: order.orderNumber,
                token: order.trackingToken,
              }).then((result) => {
                setPersistError(result.ok ? null : result.message);
                setSaving(false);
              });
            }}
          />
        ) : null}
        <SecondaryButton label="Continue shopping" onPress={goHome} />
      </View>
    </ScreenContainer>
  );
}

function Fact({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={last ? "py-2" : "border-b border-line py-2"}>
      <AppText family="body" weight="regular" className="text-[11px] text-muted">
        {label}
      </AppText>
      <AppText family="body" weight="semibold" className="mt-0.5 text-[14px] text-ink">
        {value}
      </AppText>
    </View>
  );
}

function BillRow({ label, paise }: { label: string; paise: number }) {
  return (
    <View className="mb-1.5 flex-row items-center justify-between">
      <AppText family="body" weight="regular" className="text-[13px] text-secondary">
        {label}
      </AppText>
      <PriceText paise={paise} fractionDigits={2} />
    </View>
  );
}

