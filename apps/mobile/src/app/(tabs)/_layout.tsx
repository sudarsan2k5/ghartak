import { Easing } from "react-native";
import { Tabs } from "expo-router/js-tabs";

import { BottomNavigation } from "@/components/BottomNavigation";

// The four main tabs render up front so the first visit to each is instant instead of
// building the screen and starting its requests on tap. A short cross-fade smooths the swap.
const mainTab = {
  lazy: false,
  animation: "fade",
  transitionSpec: { animation: "timing", config: { duration: 150, easing: Easing.out(Easing.quad) } },
} as const;

export default function TabLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNavigation {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Home", ...mainTab }} />
      <Tabs.Screen name="categories" options={{ title: "Categories", ...mainTab }} />
      {/* Needs a category id, so it cannot render before one is chosen. */}
      <Tabs.Screen name="category/[id]" options={{ title: "Category", animation: "fade", transitionSpec: mainTab.transitionSpec }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", ...mainTab }} />
      <Tabs.Screen name="profile" options={{ title: "You", ...mainTab }} />
    </Tabs>
  );
}
