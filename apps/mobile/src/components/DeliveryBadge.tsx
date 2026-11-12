import { Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const countUpMs = 650;
const loopPauseMs = 3200;
const shineWidth = 28;

/**
 * The delivery promise in the home header. The number counts up once, then the bolt
 * gives a short charge and a shine sweeps across, repeating every few seconds.
 * With Reduce Motion on it is a still badge.
 */
export function DeliveryBadge({ minutes }: { minutes: number }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? minutes : 1);
  const [badgeWidth, setBadgeWidth] = useState(0);
  const bolt = useSharedValue(0);
  const shine = useSharedValue(0);

  // Count up once on mount.
  useEffect(() => {
    if (reduceMotion) {
      setShown(minutes);
      return;
    }
    setShown(1);
    const stepMs = countUpMs / Math.max(minutes - 1, 1);
    const timer = setInterval(() => {
      setShown((current) => {
        if (current >= minutes) {
          clearInterval(timer);
          return minutes;
        }
        return current + 1;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [minutes, reduceMotion]);

  // Bolt charge and shine sweep, starting once the count has landed.
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    bolt.value = withDelay(
      countUpMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
          withTiming(-1, { duration: 140 }),
          withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: loopPauseMs }),
        ),
        -1,
      ),
    );
    shine.value = withDelay(
      countUpMs + 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: loopPauseMs - 260 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(bolt);
      cancelAnimation(shine);
    };
  }, [bolt, shine, reduceMotion]);

  const boltStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bolt.value * 14}deg` }, { scale: 1 + Math.abs(bolt.value) * 0.25 }],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -shineWidth + shine.value * (badgeWidth + shineWidth * 2) }, { skewX: "-20deg" }],
  }));

  return (
    <View
      accessible
      accessibilityLabel={`Delivery in ${minutes} minutes`}
      onLayout={(event) => setBadgeWidth(event.nativeEvent.layout.width)}
      className="ml-2 flex-row items-center gap-1 overflow-hidden rounded-lg bg-ink px-2 py-1"
    >
      <Animated.View style={boltStyle}>
        <Zap color={colors.lime} fill={colors.lime} size={12} strokeWidth={2.4} />
      </Animated.View>
      {/* A fixed-width slot so the badge does not resize while the number counts. */}
      <View style={{ minWidth: 15 }} className="items-end">
        <AppText family="body" weight="extrabold" className="text-[12px] leading-[16px] text-white">
          {String(shown)}
        </AppText>
      </View>
      <AppText family="body" weight="extrabold" className="text-[12px] leading-[16px] text-white">
        minutes
      </AppText>
      {reduceMotion ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: -4, bottom: -4, left: 0, width: shineWidth, backgroundColor: "rgba(255,255,255,0.22)" },
            shineStyle,
          ]}
        />
      )}
    </View>
  );
}
