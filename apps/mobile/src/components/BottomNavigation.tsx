import type { BottomTabBarProps } from "expo-router/js-tabs";
import { ClipboardList, House, LayoutGrid, UserRound, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { tapSelection } from "@/feedback/haptics";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const tabs: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "index", label: "Home", Icon: House },
  { name: "categories", label: "Categories", Icon: LayoutGrid },
  { name: "orders", label: "Orders", Icon: ClipboardList },
  { name: "profile", label: "You", Icon: UserRound },
];

export function BottomNavigation({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const activeName = state.routes[state.index]?.name;
  // The tapped tab lights up immediately, before the screen has finished switching.
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  useEffect(() => {
    setPressedKey(null);
  }, [state.index]);

  return (
    <View className="border-t border-line bg-white" style={{ paddingBottom: insets.bottom }}>
      <View className="h-16 flex-row items-center justify-around px-[18px]">
        {state.routes.map((route, index) => {
          const tab = tabs.find((item) => item.name === route.name);
          if (!tab) {
            return null;
          }
          const focused = state.index === index;
          const browsingCategory = activeName === "category/[id]" && route.name === "categories";
          const selected = pressedKey ? pressedKey === route.key : focused || browsingCategory;
          return (
            <TabItem
              key={route.key}
              label={tab.label}
              Icon={tab.Icon}
              selected={selected}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  tapSelection();
                  setPressedKey(route.key);
                  navigateToTab(route.key);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  label,
  Icon,
  selected,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  selected: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    fill.value = reduceMotion
      ? withTiming(selected ? 1 : 0, { duration: 0 })
      : withSpring(selected ? 1 : 0, { damping: 16, stiffness: 260, mass: 0.6 });
  }, [fill, reduceMotion, selected]);

  // The lime pill grows out from the icon instead of switching on abruptly.
  const pill = useAnimatedStyle(() => ({
    opacity: Math.min(fill.value, 1),
    transform: [{ scaleX: 0.55 + fill.value * 0.45 }, { scaleY: 0.75 + fill.value * 0.25 }],
  }));
  const icon = useAnimatedStyle(() => ({
    transform: [{ translateY: -fill.value * 1 }, { scale: 1 + fill.value * 0.06 }],
  }));
  const color = selected ? colors.ink : colors.muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      className="w-[72px] items-center"
    >
      <View className="h-[27px] w-[46px] items-center justify-center">
        <Animated.View style={[{ position: "absolute", inset: 0, borderRadius: 999, backgroundColor: colors.lime }, pill]} />
        <Animated.View style={icon}>
          <Icon color={color} size={19} strokeWidth={selected ? 2.4 : 2} />
        </Animated.View>
      </View>
      <AppText
        family="display"
        weight={selected ? "extrabold" : "medium"}
        className={`mt-0.5 text-[10px] leading-[13px] ${selected ? "text-ink" : "text-muted"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
