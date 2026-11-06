import { ArrowLeft, ChevronDown, UserRound, Zap } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

type HomeHeaderProps = {
  variant: "home";
  etaLabel: string;
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
          <AppText family="inter" weight="black" className="text-[27px] text-ink">
            Ghartak
          </AppText>
          <View className="ml-2 flex-row items-center gap-1 rounded-lg bg-ink px-2 py-1">
            <Zap color={colors.white} size={12} strokeWidth={2.4} />
            <AppText family="inter" weight="extrabold" className="text-[12px] text-white">
              {props.etaLabel}
            </AppText>
          </View>
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
          <AppText family="inter" weight="extrabold" className="text-[13px] text-ink">
            {props.addressLabel}
          </AppText>
          <AppText
            family="inter"
            weight="regular"
            numberOfLines={1}
            className="shrink text-[13px] text-ink"
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
        <AppText family="jakarta" weight="extrabold" className="text-[20px] text-ink">
          {props.title}
        </AppText>
        {props.subtitle ? (
          <AppText family="inter" weight="regular" className="mt-0.5 text-[12px] text-secondary">
            {props.subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
