import { Pressable, View } from "react-native";

import { AppText } from "@/theme/AppText";

type CategoryCardProps = {
  label: string;
  onPress: () => void;
  selected?: boolean;
};

export function CategoryCard({ label, onPress, selected = false }: CategoryCardProps) {
  const letter = label.trim().slice(0, 1).toUpperCase();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} className="px-[5px]">
      <View
        className={`aspect-[76/65] w-full items-center justify-center overflow-hidden rounded-xl ${selected ? "border border-ink bg-lime" : "bg-white"}`}
      >
        <AppText family="jakarta" weight="extrabold" className="text-[18px] text-ink">
          {letter}
        </AppText>
      </View>
      <AppText
        family="inter"
        weight="regular"
        numberOfLines={2}
        className="mt-1 text-center text-[10px] leading-[1.2] text-ink"
      >
        {label}
      </AppText>
    </Pressable>
  );
}
