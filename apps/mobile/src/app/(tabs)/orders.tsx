import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { CatalogueStatus } from "@/components/CatalogueStatus";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { AppText } from "@/theme/AppText";
import { trackingCopy, formatTrackingTime } from "@/tracking/copy";
import { listTrackingSummaries, type TrackingOrderSummary } from "@/tracking/credentials";

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<TrackingOrderSummary[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setOrders(await listTrackingSummaries());
    } catch {
      setFailed(true);
      setOrders([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScreenContainer>
      <PageHeader variant="title" title="Orders" />
      {failed ? (
        <View className="flex-1 justify-center">
          <CatalogueStatus
            title={`${trackingCopy.storeErrorTitle} ${trackingCopy.storeErrorBody}`}
            actionLabel="Try again"
            onAction={() => {
              void load();
            }}
          />
        </View>
      ) : orders.length === 0 ? (
        <View className="flex-1 justify-center">
          <CatalogueStatus title={`${trackingCopy.emptyTitle}. ${trackingCopy.emptyBody}`} />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {orders.map((order) => (
            <Pressable
              key={order.orderNumber}
              accessibilityRole="button"
              accessibilityLabel={`Track order ${order.orderNumber}`}
              onPress={() => {
                router.push({ pathname: "/order-tracking", params: { orderNumber: order.orderNumber } });
              }}
              className="mb-3 rounded-[18px] border border-line bg-white px-4 py-4"
            >
              <AppText family="display" weight="extrabold" className="text-[16px] text-ink">
                {order.orderNumber}
              </AppText>
              <AppText family="body" weight="regular" className="mt-1 text-[12px] text-secondary">
                {`Saved ${formatTrackingTime(order.savedAt)}`}
              </AppText>
              <AppText family="body" weight="semibold" className="mt-2 text-[13px] text-ink">
                {trackingCopy.trackAction}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
