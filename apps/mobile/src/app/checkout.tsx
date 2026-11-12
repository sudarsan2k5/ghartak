import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { Banknote } from "lucide-react-native";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";

import { placeGuestOrder } from "@/api/checkout";
import { createCheckoutSubmitter, type CheckoutSubmitFailure } from "@/cart/checkout-form";
import { guestCheckoutCopy } from "@/cart/guest-checkout";
import { commitSuccessfulCheckout } from "@/cart/placed-order";
import { saveTrackingCredential } from "@/tracking/credentials";
import { useCartLines } from "@/cart/use-cart-lines";
import { checkoutReadiness } from "@/cart/view";
import { PageHeader } from "@/components/PageHeader";
import { PriceText } from "@/components/PriceText";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { catalogueKeys } from "@/query/catalogue";
import { useCartStore } from "@/state/cart";
import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";
import { colors } from "@/theme/tokens";
import { confirmSuccess } from "@/feedback/haptics";

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCartLines();
  const clear = useCartStore((state) => state.clear);
  const readiness = checkoutReadiness({
    itemCount: cart.itemCount,
    subtotalPaise: cart.subtotalPaise,
    lines: cart.lines,
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitter = useRef(
    createCheckoutSubmitter({
      client: { place: placeGuestOrder },
      generateKey: () => Crypto.randomUUID(),
      productName: (productId) => {
        const line = useCartStore.getState().items.find((item) => item.productId === productId);
        return line?.display?.name ?? null;
      },
    }),
  ).current;

  const items = useMemo(
    () => cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    [cart.items],
  );

  async function onPlaceOrder() {
    if (busy || submitter.isBusy() || !readiness.ready) {
      return;
    }
    setBusy(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const result = await submitter.submit({
        form: { customerName: name, customerPhone: phone, deliveryAddress: address },
        items,
      });
      if (result.ok) {
        const productIds = result.order.items.map((item) => item.productId);
        commitSuccessfulCheckout(result.order, { clear });
        await saveTrackingCredential({
          orderNumber: result.order.orderNumber,
          token: result.order.trackingToken,
        });
        for (const productId of productIds) {
          void queryClient.invalidateQueries({ queryKey: catalogueKeys.product(productId) });
        }
        confirmSuccess();
        router.replace("/order-confirmation");
        return;
      }
      applyFailure(result);
    } finally {
      setBusy(false);
    }
  }

  function applyFailure(result: CheckoutSubmitFailure) {
    if (result.kind === "validation") {
      setFieldErrors(result.fields);
      setSubmitError(result.message);
      return;
    }
    setSubmitError(result.message);
    if (result.kind === "unavailable_product" || result.kind === "insufficient_stock") {
      void cart.refetch();
      if (result.productId) {
        void queryClient.invalidateQueries({ queryKey: catalogueKeys.product(result.productId) });
      }
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <PageHeader variant="title" title={guestCheckoutCopy.title} onBack={() => router.back()} />
        {!readiness.ready ? (
          <View className="flex-1 px-5 pt-4">
            <AppText family="display" weight="extrabold" className="text-[22px] text-ink">
              {guestCheckoutCopy.notReady}
            </AppText>
            <AppText family="body" weight="regular" className="mt-3 text-[14px] leading-6 text-secondary">
              {readiness.reason}
            </AppText>
            <View className="mt-6">
              <SecondaryButton label="Review cart" onPress={() => router.replace("/cart")} />
            </View>
          </View>
        ) : (
          <>
            <ScrollView
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              <AppText family="body" weight="bold" className="mt-1 text-[11px] uppercase text-secondary">
                {guestCheckoutCopy.eyebrow}
              </AppText>
              <AppText family="body" weight="regular" className="mt-2 text-[14px] leading-6 text-secondary">
                {guestCheckoutCopy.body}
              </AppText>

              <Section title="Your details">
                <Field
                  label="Full name"
                  value={name}
                  onChangeText={setName}
                  error={fieldErrors.customerName}
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!busy}
                />
                <Field
                  label="Mobile number"
                  value={phone}
                  onChangeText={setPhone}
                  error={fieldErrors.customerPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!busy}
                />
                <Field
                  label="Delivery address"
                  value={address}
                  onChangeText={setAddress}
                  error={fieldErrors.deliveryAddress}
                  multiline
                  editable={!busy}
                />
              </Section>

              <Section title="Payment">
                <View className="flex-row items-start gap-3 rounded-xl border border-ink bg-[#F1EAF5] px-3.5 py-3.5">
                  <View className="h-10 w-10 items-center justify-center rounded-lg bg-white">
                    <Banknote color={colors.ink} size={20} strokeWidth={2.2} />
                  </View>
                  <View className="flex-1">
                    <AppText family="display" weight="extrabold" className="text-[15px] text-ink">
                      Cash on Delivery
                    </AppText>
                    <AppText family="body" weight="regular" className="mt-1 text-[12px] leading-5 text-secondary">
                      {guestCheckoutCopy.payOnDelivery}
                    </AppText>
                  </View>
                </View>
              </Section>

              <Section title="Order">
                {cart.lines.map((line) => (
                  <View key={line.item.productId} className="flex-row items-start justify-between gap-3 py-2">
                    <View className="min-w-0 flex-1">
                      <AppText family="body" weight="bold" className="text-[13px] text-ink">
                        {line.offer?.name ?? line.item.display?.name ?? "Product"}
                      </AppText>
                      <AppText family="body" weight="regular" className="mt-0.5 text-[11px] text-muted">
                        {line.status.kind === "available"
                          ? `Qty ${line.item.quantity} · ${formatRupees(line.status.pricePaise, { fractionDigits: 2 })} each`
                          : `Qty ${line.item.quantity}`}
                      </AppText>
                    </View>
                    {line.status.kind === "available" ? (
                      <PriceText paise={line.status.pricePaise * line.item.quantity} fractionDigits={2} />
                    ) : null}
                  </View>
                ))}
                <View className="mt-2 gap-2 border-t border-line pt-3">
                  {cart.savingsPaise > 0 && readiness.subtotalPaise !== null ? (
                    <Row label="Item total (MRP)" value={readiness.subtotalPaise + cart.savingsPaise} />
                  ) : null}
                  {cart.savingsPaise > 0 ? (
                    <View className="flex-row items-center justify-between">
                      <AppText family="body" weight="regular" className="text-[13px] text-savings">
                        You save on MRP
                      </AppText>
                      <AppText family="body" weight="bold" className="text-[13px] text-savings">
                        {`−${formatRupees(cart.savingsPaise, { fractionDigits: 2 })}`}
                      </AppText>
                    </View>
                  ) : null}
                  <Row label="Subtotal" value={readiness.subtotalPaise} />
                  <AppText family="body" weight="regular" className="mt-2 text-[12px] leading-5 text-secondary">
                    {guestCheckoutCopy.deliveryPending}
                  </AppText>
                </View>
              </Section>

              {submitError ? (
                <View className="mt-4 rounded-xl border border-line bg-white px-4 py-3" accessibilityRole="alert">
                  <AppText family="body" weight="regular" className="text-[13px] leading-5 text-secondary">
                    {submitError}
                  </AppText>
                </View>
              ) : null}
            </ScrollView>
            <View className="gap-2 border-t border-line bg-white px-5 pb-3 pt-3">
              <PrimaryButton
                tone="lime"
                label={busy ? guestCheckoutCopy.placing : "Place order"}
                disabled={busy}
                onPress={() => {
                  void onPlaceOrder();
                }}
              />
              <AppText family="body" weight="regular" className="text-center text-[11px] text-muted">
                Cash on delivery · Pay when it arrives
              </AppText>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-5 rounded-[18px] border border-line bg-white px-4 py-4">
      <AppText family="display" weight="extrabold" className="mb-3 text-[16px] text-ink">
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: number | null }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText family="body" weight="regular" className="text-[13px] text-secondary">
        {label}
      </AppText>
      {value !== null ? <PriceText paise={value} fractionDigits={2} /> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  error,
  multiline = false,
  keyboardType,
  autoCapitalize,
  autoComplete,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  multiline?: boolean;
  keyboardType?: "phone-pad" | "default";
  autoCapitalize?: "none" | "words";
  autoComplete?: "name" | "tel";
  editable: boolean;
}) {
  return (
    <View className="mb-3">
      <AppText family="body" weight="semibold" className="mb-1.5 text-[12px] text-secondary">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? (multiline ? "sentences" : "none")}
        autoComplete={autoComplete}
        autoCorrect={!multiline}
        textAlignVertical={multiline ? "top" : "center"}
        className={`rounded-xl border bg-page px-3.5 text-[14px] text-ink ${multiline ? "h-[108px] py-3" : "h-[48px]"} ${
          error ? "border-ink" : "border-line"
        }`}
        style={{ fontFamily: "Figtree_400Regular" }}
        placeholderTextColor={colors.muted}
      />
      {error ? (
        <AppText family="body" weight="regular" className="mt-1.5 text-[12px] leading-5 text-secondary">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

