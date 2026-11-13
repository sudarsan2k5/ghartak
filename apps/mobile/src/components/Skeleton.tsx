import { useEffect } from "react";
import { View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/tokens";

/** One grey placeholder shape. Pulses gently unless Reduce Motion is on. */
export function SkeletonBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    opacity.value = withRepeat(withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.line }, pulse, style]} />
  );
}

/** Matches the product card's shape so the grid does not jump when products arrive. */
export function ProductCardSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width }} className="rounded-2xl border border-line bg-white p-2">
      <SkeletonBlock width="100%" height={112} radius={12} />
      <View className="mt-2 gap-1.5 px-0.5">
        <SkeletonBlock width={58} height={16} radius={6} />
        <SkeletonBlock width="90%" height={13} />
        <SkeletonBlock width="60%" height={13} />
        <SkeletonBlock width="35%" height={11} />
        <View className="mt-1 flex-row items-end justify-between">
          <SkeletonBlock width={44} height={30} />
          <SkeletonBlock width={76} height={32} />
        </View>
      </View>
    </View>
  );
}

export function ProductGridSkeleton({
  width,
  count = 4,
  gap = 12,
  paddingHorizontal = 20,
}: {
  width: number;
  count?: number;
  gap?: number;
  paddingHorizontal?: number;
}) {
  return (
    <View
      className="flex-row flex-wrap"
      style={{ columnGap: gap, rowGap: gap, paddingHorizontal }}
      accessibilityLabel="Loading products"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} width={width} />
      ))}
    </View>
  );
}

export function ProductRailSkeleton({ width, count = 3 }: { width: number; count?: number }) {
  return (
    <View className="flex-row px-5" style={{ columnGap: 12 }} accessibilityLabel="Loading products" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} width={width} />
      ))}
    </View>
  );
}

/** Four category tiles, matching the home row. */
export function CategoryRowSkeleton() {
  return (
    <View className="flex-row" style={{ marginHorizontal: -5 }} accessibilityLabel="Loading categories" accessibilityRole="progressbar">
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={{ flex: 1 }} className="items-center px-[5px]">
          <SkeletonBlock width="100%" height={65} radius={12} />
          <SkeletonBlock width="70%" height={10} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

export function ProductDetailSkeleton({ width }: { width: number }) {
  return (
    <View accessibilityLabel="Loading product" accessibilityRole="progressbar">
      <SkeletonBlock width={width} height={300} radius={0} />
      <View className="gap-4 px-5 pt-5">
        <View className="flex-row justify-between">
          <SkeletonBlock width={72} height={22} radius={100} />
          <SkeletonBlock width={88} height={14} />
        </View>
        <SkeletonBlock width="80%" height={20} />
        <SkeletonBlock width="100%" height={128} radius={12} />
      </View>
    </View>
  );
}
