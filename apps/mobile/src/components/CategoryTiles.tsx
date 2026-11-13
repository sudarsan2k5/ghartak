import { ArrowRight, Zap } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { CatalogueImage } from "@/components/CatalogueImage";
import { AppText } from "@/theme/AppText";
import { tileTint } from "@/theme/tints";
import { colors } from "@/theme/tokens";

/** Each tile arrives a beat after the one before, capped so long lists do not drag. */
function entering(index: number) {
  return FadeInDown.duration(320).delay(Math.min(index, 10) * 45);
}

/** Shrinks a little under the finger and springs back, so taps feel physical. */
function PressScale({
  label,
  onPress,
  children,
  style,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  style?: object;
}) {
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      }}
      style={style}
    >
      <Animated.View style={pressed}>{children}</Animated.View>
    </Pressable>
  );
}

function Initial({ label, size }: { label: string; size: number }) {
  return (
    <AppText family="display" weight="extrabold" className="text-ink" style={{ fontSize: size, lineHeight: size * 1.25 }}>
      {label.trim().slice(0, 1).toUpperCase()}
    </AppText>
  );
}

/** The first category, shown large in the brand's ink and lime. */
export function FeaturedCategoryCard({
  name,
  imagePath,
  minutes,
  onPress,
}: {
  name: string;
  imagePath: string | null;
  minutes: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={entering(0)}>
      <PressScale label={`Shop ${name}`} onPress={onPress}>
        <View className="h-[132px] flex-row items-center overflow-hidden rounded-[20px] bg-ink pl-5 pr-3">
          <View className="min-w-0 flex-1 pr-3">
            <View className="flex-row items-center gap-1 self-start rounded-full bg-white/10 px-2 py-0.5">
              <Zap color={colors.lime} fill={colors.lime} size={10} strokeWidth={2.4} />
              <AppText family="body" weight="bold" className="text-[10px] leading-[13px] text-lime">
                {`In ${minutes} mins`}
              </AppText>
            </View>
            <AppText
              family="display"
              weight="extrabold"
              numberOfLines={2}
              className="mt-2 text-[22px] leading-[27px] text-white"
            >
              {name}
            </AppText>
            <View className="mt-2.5 flex-row items-center gap-1 self-start rounded-full bg-lime px-3 py-1">
              <AppText family="display" weight="bold" className="text-[12px] leading-[16px] text-ink">
                Shop now
              </AppText>
              <ArrowRight color={colors.ink} size={13} strokeWidth={2.4} />
            </View>
          </View>
          <View className="h-[108px] w-[108px] items-center justify-center overflow-hidden rounded-[18px] bg-white p-2">
            {imagePath ? <CatalogueImage deliveryPath={imagePath} alt={name} /> : <Initial label={name} size={34} />}
          </View>
        </View>
      </PressScale>
    </Animated.View>
  );
}

/** A grid tile: a tinted photo well with the name underneath. */
export function CategoryTile({
  name,
  imagePath,
  index,
  width,
  onPress,
}: {
  name: string;
  imagePath: string | null;
  index: number;
  width: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={entering(index + 1)} style={{ width }}>
      <PressScale label={name} onPress={onPress}>
        <View
          className="aspect-square w-full items-center justify-center overflow-hidden rounded-[18px] p-2.5"
          style={{ backgroundColor: tileTint(index) }}
        >
          {imagePath ? <CatalogueImage deliveryPath={imagePath} alt={name} /> : <Initial label={name} size={26} />}
        </View>
        <AppText
          family="body"
          weight="semibold"
          numberOfLines={2}
          className="mt-2 min-h-[32px] px-0.5 text-center text-[12px] leading-[16px] text-ink"
        >
          {name}
        </AppText>
      </PressScale>
    </Animated.View>
  );
}
