import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const size = 8;

/** A status dot. When live, a ring pulses out from it; with Reduce Motion on, it stays still. */
export function LiveDot({ color, live }: { color: string; live: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const animate = live && !reduceMotion;

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  const ring = useAnimatedStyle(() => ({
    opacity: animate ? 0.55 * (1 - progress.value) : 0,
    transform: [{ scale: 1 + progress.value * 1.6 }],
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View
        style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}
