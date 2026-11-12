import { ArrowLeft, ChevronDown, UserRound } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { DeliveryBadge } from "@/components/DeliveryBadge";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

type HomeHeaderProps = {
  variant: "home";
  etaMinutes: number;
  addressLabel: string;
  addressLine: string;
  onAccountPress: () => void;
};

type TitleHeaderProps = {
  variant: "title";
  title: string;
  subtitle?: string;
  onBack?: () => void;
};

type PageHeaderProps = HomeHeaderProps | TitleHeaderProps;

export function PageHeader(props: PageHeaderProps) {
  if (props.variant === "home") {
    return (
      <View className="gap-3 px-5 pb-4 pt-1">
        <View className="flex-row items-center">
          <AppText family="body" weight="black" className="text-[27px] leading-[34px] text-ink">
            Ghartak
          </AppText>
          <DeliveryBadge minutes={props.etaMinutes} />
          <View className="flex-1" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            onPress={props.onAccountPress}
            className="h-[38px] w-[38px] items-center justify-center rounded-full border border-line bg-white"
          >
            <UserRound color={colors.ink} size={20} strokeWidth={2} />
          </Pressable>
        </View>
        <View className="flex-row items-center">
          <AppText family="body" weight="extrabold" className="text-[13px] leading-[18px] text-ink">
            {props.addressLabel}
          </AppText>
          <AppText
            family="body"
            weight="regular"
            numberOfLines={1}
            className="shrink text-[13px] leading-[18px] text-ink"
          >
            {` · ${props.addressLine}`}
          </AppText>
          <ChevronDown color={colors.ink} size={13} strokeWidth={2.4} style={{ marginLeft: 2 }} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-3 px-5 py-3.5">
      {props.onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={props.onBack} hitSlop={8}>
          <ArrowLeft color={colors.ink} size={22} strokeWidth={2.2} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <AppText family="display" weight="extrabold" className="text-[20px] leading-[26px] text-ink">
          {props.title}
        </AppText>
        {props.subtitle ? (
          <AppText family="body" weight="regular" className="mt-0.5 text-[12px] leading-[16px] text-secondary">
            {props.subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
