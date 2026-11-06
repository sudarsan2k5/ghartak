import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { colors } from "@/theme/tokens";

export function LoadingIndicator({ compact = false }: { compact?: boolean }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View className={compact ? "items-center justify-center bg-page py-8" : "flex-1 items-center justify-center bg-page"}>
      <Animated.View
        style={[
          {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.lime,
            borderWidth: 2,
            borderColor: colors.ink,
          },
          pulse,
        ]}
      />
    </View>
  );
}
