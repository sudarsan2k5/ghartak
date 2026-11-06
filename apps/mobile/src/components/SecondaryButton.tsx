import { Pressable } from "react-native";

import { AppText } from "@/theme/AppText";

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
};

export function SecondaryButton({ label, onPress }: SecondaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-[52px] items-center justify-center rounded-xl border border-ink bg-white px-[18px]"
    >
      <AppText family="jakarta" weight="bold" className="text-[16px] text-ink">
        {label}
      </AppText>
    </Pressable>
  );
}
