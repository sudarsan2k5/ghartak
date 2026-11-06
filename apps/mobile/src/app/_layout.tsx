import "../../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { CartSync } from "@/cart/CartSync";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { queryClient } from "@/query/client";
import { fontAssets } from "@/theme/fonts";
import { colors } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded || error) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return <LoadingIndicator />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.page }}>
      <QueryClientProvider client={queryClient}>
        <CartSync />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.page },
          }}
        />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
