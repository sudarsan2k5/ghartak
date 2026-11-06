import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";

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
            onChange(1);
          }
        }}
        className={`h-8 min-w-[76px] flex-row items-center justify-center rounded-lg border border-ink bg-white px-2.5 ${atMax ? "opacity-40" : ""}`}
      >
        <AppText family="inter" weight="extrabold" className="text-[12px] text-ink">
          ADD +
        </AppText>
      </Pressable>
    );
  }

  return (
    <View className="h-8 w-[76px] flex-row items-center justify-between rounded-lg border border-lime bg-lime px-2.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        hitSlop={8}
        onPress={() => {
          onChange(quantity - 1);
        }}
      >
        <Minus color={colors.ink} size={14} strokeWidth={2.6} />
      </Pressable>
      <AppText family="inter" weight="extrabold" className="text-[13px] text-ink">
        {String(quantity)}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        hitSlop={8}
        onPress={() => {
          if (!atMax) {
            onChange(quantity + 1);
          }
        }}
        style={{ opacity: atMax ? 0.35 : 1 }}
      >
        <Plus color={colors.ink} size={14} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}
