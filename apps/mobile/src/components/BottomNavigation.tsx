import type { BottomTabBarProps } from "expo-router/js-tabs";
import { ClipboardList, House, LayoutGrid, UserRound, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const tabs: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: "index", label: "Home", Icon: House },
  { name: "categories", label: "Categories", Icon: LayoutGrid },
  { name: "orders", label: "Orders", Icon: ClipboardList },
  { name: "profile", label: "You", Icon: UserRound },
];

export function BottomNavigation({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View className="border-t border-line bg-white" style={{ paddingBottom: insets.bottom }}>
      <View className="h-16 flex-row items-center justify-around px-[18px]">
        {state.routes.map((route, index) => {
          const tab = tabs.find((item) => item.name === route.name);
          if (!tab) {
            return null;
          }
          const selected = state.index === index;
          const color = selected ? colors.ink : colors.muted;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
              className="w-[72px] items-center"
            >
              <View
                className={`h-[27px] w-[46px] items-center justify-center rounded-full ${selected ? "bg-lime" : "bg-white"}`}
              >
                <tab.Icon color={color} size={19} strokeWidth={selected ? 2.4 : 2} />
              </View>
              <AppText
                family="jakarta"
                weight={selected ? "extrabold" : "medium"}
                className={`mt-0.5 text-[10px] ${selected ? "text-ink" : "text-muted"}`}
              >
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
