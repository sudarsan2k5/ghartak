import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { SecondaryButton } from "@/components/SecondaryButton";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

type CatalogueStatusProps = {
  title: string;
  /** A second, quieter line that explains what to do next. */
  body?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
};

export function CatalogueStatus({ title, body, icon: Icon, actionLabel, onAction }: CatalogueStatusProps) {
  return (
    <Animated.View entering={FadeIn.duration(220)} className="items-center gap-3 px-8 py-8">
      {Icon ? (
        <View className="mb-1 h-14 w-14 items-center justify-center rounded-full bg-lime">
          <Icon color={colors.ink} size={24} strokeWidth={2} />
        </View>
      ) : null}
      <AppText
        family={Icon ? "display" : "body"}
        weight={Icon ? "bold" : "regular"}
        className={`text-center ${Icon ? "text-[17px] text-ink" : "text-[14px] text-secondary"}`}
      >
        {title}
      </AppText>
      {body ? (
        <AppText family="body" weight="regular" className="-mt-1 text-center text-[13px] leading-5 text-secondary">
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <SecondaryButton label={actionLabel} onPress={onAction} /> : null}
    </Animated.View>
  );
}
