import { useRouter } from "expo-router";
import { ArrowRight, ShoppingBag } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOutDown } from "react-native-reanimated";

import { useCartLines } from "@/cart/use-cart-lines";
import { basketBarView } from "@/cart/view";
import { PriceText } from "@/components/PriceText";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

export function BasketBar() {
  const router = useRouter();
  const lines = useCartLines();
  const preview = basketBarView({
    itemCount: lines.itemCount,
    subtotalPaise: lines.subtotalPaise,
    isConfirming: lines.isConfirming,
    canCheckout: lines.canCheckout,
    checkoutBlockReason: lines.checkoutBlockReason,
    lines: lines.lines,
  });

  if (!preview.visible) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(180)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View cart"
        onPress={() => {
          router.push("/cart");
        }}
        className="mx-4 mb-2 h-[52px] flex-row items-center rounded-xl bg-ink px-[18px] active:opacity-90"
      >
        <ShoppingBag color={colors.white} size={18} strokeWidth={2} />
        <View className="ml-3 min-w-0 flex-1">
          <AppText family="body" weight="extrabold" className="text-[10px] uppercase text-lime">
            {`${String(preview.itemCount)} items`}
          </AppText>
          {preview.quote === "ready" && preview.subtotalPaise !== null ? (
            // Keyed by the total so the new amount fades in whenever the cart changes.
            <Animated.View key={preview.subtotalPaise} entering={FadeIn.duration(220)}>
              <PriceText paise={preview.subtotalPaise} tone="white" size="total" fractionDigits={2} />
            </Animated.View>
          ) : (
            <AppText family="body" weight="semibold" className="text-[12px] text-white" numberOfLines={1}>
              {preview.caption}
            </AppText>
          )}
        </View>
        <AppText family="body" weight="semibold" className="text-[14px] text-white">
          View cart
        </AppText>
        <ArrowRight color={colors.white} size={16} strokeWidth={2.2} style={{ marginLeft: 6 }} />
      </Pressable>
    </Animated.View>
  );
}
