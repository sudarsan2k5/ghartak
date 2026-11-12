import { Tabs, type BottomTabNavigationOptions } from "expo-router/js-tabs";
import { useReducedMotion } from "react-native-reanimated";

import { BottomNavigation } from "@/components/BottomNavigation";

type SceneInterpolator = NonNullable<BottomTabNavigationOptions["sceneStyleInterpolator"]>;
type SceneTransition = NonNullable<BottomTabNavigationOptions["transitionSpec"]>;

// progress is -1 for tabs left of the active one, 0 for the active tab, and 1 for tabs to its right.
// The incoming screen fades in while gliding a short way from the side you are moving towards,
// and the outgoing one fades out the other way. Opacity and transform run on the native driver,
// so the motion stays smooth even while the new screen finishes rendering.
const glide: SceneInterpolator = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: [-1, -0.5, 0, 0.5, 1],
      outputRange: [0, 0, 1, 0, 0],
    }),
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-16, 0, 16],
        }),
      },
    ],
  },
});

// A critically damped spring settles quickly without bouncing, which reads as smoother than a fixed timer.
const settle: SceneTransition = {
  animation: "spring",
  config: { stiffness: 380, damping: 40, mass: 1, overshootClamping: true, restDisplacementThreshold: 0.01, restSpeedThreshold: 0.01 },
};

const transition: BottomTabNavigationOptions = { sceneStyleInterpolator: glide, transitionSpec: settle };
const still: BottomTabNavigationOptions = { animation: "none" };

export default function TabLayout() {
  const reduceMotion = useReducedMotion();
  const motion = reduceMotion ? still : transition;
  // The four main tabs render up front so the first visit to each is instant.
  const mainTab: BottomTabNavigationOptions = { lazy: false, ...motion };
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNavigation {...props} />}>
      <Tabs.Screen name="index" options={{ title: "Home", ...mainTab }} />
      <Tabs.Screen name="categories" options={{ title: "Categories", ...mainTab }} />
      {/* Needs a category id, so it cannot render before one is chosen. */}
      <Tabs.Screen name="category/[id]" options={{ title: "Category", ...motion }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", ...mainTab }} />
      <Tabs.Screen name="profile" options={{ title: "You", ...mainTab }} />
    </Tabs>
  );
}
