import { useRouter, type Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";

import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SecondaryButton } from "@/components/SecondaryButton";
import { AppText } from "@/theme/AppText";

type PlaceholderScreenProps = {
  title: string;
  showBack?: boolean;
  next?: { label: string; href: Href };
  children?: ReactNode;
};

export function PlaceholderScreen({ title, showBack = false, next, children }: PlaceholderScreenProps) {
  const router = useRouter();
  return (
    <ScreenContainer edges={showBack ? ["top", "bottom"] : ["top"]}>
      <PageHeader variant="title" title={title} {...(showBack ? { onBack: () => router.back() } : {})} />
      <View className="flex-1 justify-center gap-6 px-8">
        {children}
        <AppText family="body" weight="regular" className="text-center text-[14px] leading-6 text-secondary">
          This screen is on the navigation map. Its layout is not part of the home milestone.
        </AppText>
        {next ? (
          <SecondaryButton
            label={next.label}
            onPress={() => {
              router.push(next.href);
            }}
          />
        ) : null}
      </View>
    </ScreenContainer>
  );
}
