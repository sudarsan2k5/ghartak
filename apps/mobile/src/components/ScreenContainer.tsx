import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

type ScreenContainerProps = {
  children: ReactNode;
  edges?: Edge[];
};

export function ScreenContainer({ children, edges = ["top"] }: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-page" edges={edges}>
      <View className="flex-1" style={{ minHeight: 0 }}>
        {children}
      </View>
    </SafeAreaView>
  );
}
