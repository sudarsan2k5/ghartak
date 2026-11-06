import { View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { AppText } from "@/theme/AppText";

type CatalogueStatusProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function CatalogueStatus({ title, actionLabel, onAction }: CatalogueStatusProps) {
  return (
    <View className="items-center gap-3 px-8 py-6">
      <AppText family="inter" weight="regular" className="text-center text-[14px] text-secondary">
        {title}
      </AppText>
      {actionLabel && onAction ? <SecondaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
