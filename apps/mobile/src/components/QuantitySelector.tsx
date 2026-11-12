import { Minus, Plus } from "lucide-react-native";
import { Pressable } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { tapAddToCart, tapQuantity } from "@/feedback/haptics";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

type QuantitySelectorProps = {
  quantity: number;
  maxQuantity?: number;
  onChange: (quantity: number) => void;
};

export function QuantitySelector({ quantity, maxQuantity, onChange }: QuantitySelectorProps) {
  const atMax = maxQuantity !== undefined && quantity >= maxQuantity;
  if (quantity <= 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        disabled={atMax}
        onPress={() => {
          if (!atMax) {
            tapAddToCart();
            onChange(1);
          }
        }}
        className={`h-8 min-w-[76px] flex-row items-center justify-center rounded-lg border border-ink bg-white px-2.5 active:opacity-70 ${atMax ? "opacity-40" : ""}`}
      >
        <AppText family="body" weight="extrabold" className="text-[12px] text-ink">
          ADD +
        </AppText>
      </Pressable>
    );
  }

  return (
    <Animated.View
      entering={ZoomIn.duration(160)}
      className="h-8 w-[76px] flex-row items-center justify-between rounded-lg border border-lime bg-lime px-2.5"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        hitSlop={8}
        onPress={() => {
          tapQuantity();
          onChange(quantity - 1);
        }}
      >
        <Minus color={colors.ink} size={14} strokeWidth={2.6} />
      </Pressable>
      {/* Keyed by the count so each change fades the new number in. */}
      <Animated.View key={quantity} entering={FadeIn.duration(180)}>
        <AppText family="body" weight="extrabold" className="text-[13px] text-ink">
          {String(quantity)}
        </AppText>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        hitSlop={8}
        onPress={() => {
          if (!atMax) {
            tapQuantity();
            onChange(quantity + 1);
          }
        }}
        style={{ opacity: atMax ? 0.35 : 1 }}
      >
        <Plus color={colors.ink} size={14} strokeWidth={2.6} />
      </Pressable>
    </Animated.View>
  );
}
