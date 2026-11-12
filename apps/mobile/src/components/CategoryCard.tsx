import { Pressable, View } from "react-native";

import { CatalogueImage } from "@/components/CatalogueImage";
import { AppText } from "@/theme/AppText";

type CategoryCardProps = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  imagePath?: string | null;
  large?: boolean;
};

export function CategoryCard({ label, onPress, selected = false, imagePath = null, large = false }: CategoryCardProps) {
  const letter = label.trim().slice(0, 1).toUpperCase();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} className="px-[5px] active:opacity-70">
      <View
        className={`aspect-[76/65] w-full items-center justify-center overflow-hidden rounded-xl ${selected ? "border border-ink bg-lime" : "bg-white"}`}
      >
        {imagePath ? (
          <CatalogueImage deliveryPath={imagePath} alt={label} />
        ) : (
          <AppText family="display" weight="extrabold" className="text-[18px] text-ink">
            {letter}
          </AppText>
        )}
      </View>
      <AppText
        family="body"
        weight="regular"
        numberOfLines={2}
        className={`mt-1 text-center text-ink ${large ? "text-[12px] leading-[15px]" : "text-[10px] leading-[13px]"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
