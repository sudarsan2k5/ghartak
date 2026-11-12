import { Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
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

const loopPauseMs = 3200;
const shineWidth = 48;
const circle = 24;

/**
 * "Delivery in N mins to home" strip for the cart. It slides in, a lime ring pulses from
 * the bolt, and every few seconds the bolt charges and a shine sweeps across.
 * With Reduce Motion on it is a still strip.
 */
export function DeliveryStrip({ minutes, place }: { minutes: number; place: string }) {
  const reduceMotion = useReducedMotion();
  const [stripWidth, setStripWidth] = useState(0);
  const ring = useSharedValue(0);
  const bolt = useSharedValue(0);
  const shine = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    bolt.value = withDelay(
      400,
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
      600,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: loopPauseMs - 460 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(ring);
      cancelAnimation(bolt);
      cancelAnimation(shine);
    };
  }, [bolt, reduceMotion, ring, shine]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 0.7 }],
  }));
  const boltStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bolt.value * 14}deg` }, { scale: 1 + Math.abs(bolt.value) * 0.2 }],
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -shineWidth + shine.value * (stripWidth + shineWidth * 2) }, { skewX: "-20deg" }],
  }));

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(320)}
      accessible
      accessibilityLabel={`Delivery in ${minutes} minutes to ${place.toLowerCase()}`}
      onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
      className="flex-row items-center justify-center gap-2.5 overflow-hidden bg-ink px-4 py-2.5"
    >
      <View style={{ width: circle, height: circle }} className="items-center justify-center">
        {reduceMotion ? null : (
          <Animated.View
            style={[
              { position: "absolute", width: circle, height: circle, borderRadius: circle / 2, backgroundColor: colors.lime },
              ringStyle,
            ]}
          />
        )}
        <View style={{ width: circle, height: circle, borderRadius: circle / 2 }} className="items-center justify-center bg-lime">
          <Animated.View style={boltStyle}>
            <Zap color={colors.ink} fill={colors.ink} size={12} strokeWidth={2.4} />
          </Animated.View>
        </View>
      </View>
      <AppText family="body" weight="medium" className="text-[13px] leading-[17px] text-white">
        {"Delivery in "}
        <AppText family="display" weight="extrabold" className="text-[13px] leading-[17px] text-lime">
          {`${minutes} mins`}
        </AppText>
        {` to ${place.toLowerCase()}`}
      </AppText>
      {reduceMotion ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: -6, bottom: -6, left: 0, width: shineWidth, backgroundColor: "rgba(255,255,255,0.10)" },
            shineStyle,
          ]}
        />
      )}
    </Animated.View>
  );
}
