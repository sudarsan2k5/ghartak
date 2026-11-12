import type { ReactNode } from "react";
import { Pressable } from "react-native";

import { AppText } from "@/theme/AppText";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "ink" | "lime";
  icon?: ReactNode;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, tone = "ink", icon, disabled = false }: PrimaryButtonProps) {
  const background = tone === "lime" ? "bg-lime" : "bg-ink";
  const text = tone === "lime" ? "text-ink" : "text-white";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`h-[52px] flex-row items-center justify-center gap-2 rounded-xl px-[18px] ${background} ${disabled ? "opacity-40" : ""}`}
    >
      {icon}
      <AppText family="display" weight="extrabold" className={`text-[16px] ${text}`}>
        {label}
      </AppText>
    </Pressable>
  );
}
