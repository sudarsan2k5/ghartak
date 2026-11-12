import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { fetchCustomerOrderStatus } from "@/api/order-status-client";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { orderStatusKeys } from "@/query/order-status";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";
import {
  formatTrackingTime,
  trackingCopy,
  trackingStatusExplanation,
  trackingStatusHeading,
  trackingStatusLabel,
} from "@/tracking/copy";
import { readLatestTrackingOrderNumber, readTrackingToken } from "@/tracking/credentials";
import { trackingErrorCopy, canRefreshOrderStatus } from "@/tracking/copy";
import { buildTrackingTimeline, cancelledEventTime, type TimelineStep } from "@/tracking/timeline";

export default function OrderTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderNumber?: string | string[] }>();
  const requested = firstParam(params.orderNumber);
  const tokenRef = useRef<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [hasCredential, setHasCredential] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");

  const loadCredential = useCallback(async () => {
    setLoadState("loading");
    setStoreFailed(false);
    try {
      const number = requested ?? (await readLatestTrackingOrderNumber());
      if (!number) {
        tokenRef.current = null;
        setOrderNumber(null);
        setHasCredential(false);
        setLoadState("ready");
        return;
      }
      const token = await readTrackingToken(number);
      tokenRef.current = token;
      setOrderNumber(number);
      setHasCredential(Boolean(token));
    } catch {
      tokenRef.current = null;
      setHasCredential(false);
      setStoreFailed(true);
    } finally {
      setLoadState("ready");
    }
  }, [requested]);

  useEffect(() => {
    void loadCredential();
  }, [loadCredential]);

  const query = useQuery({
    queryKey: orderNumber ? orderStatusKeys.detail(orderNumber) : ["order-status", "none"],
    queryFn: async ({ signal }) => {
      const token = tokenRef.current;
      if (!token || !orderNumber) {
        return { ok: false as const, kind: "unavailable" as const, status: null };
      }
      const result = await fetchCustomerOrderStatus(token, signal);
      if (result.ok && result.order.orderNumber !== orderNumber) {
        return { ok: false as const, kind: "invalid" as const, status: 200 };
      }
      return result;
    },
    enabled: loadState === "ready" && hasCredential && Boolean(orderNumber),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const refreshing = query.isFetching;
  async function refresh(): Promise<void> {
    if (!canRefreshOrderStatus(query.isFetching)) {
      return;
    }
    await query.refetch();
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer edges={["top", "bottom"]}>
        <PageHeader variant="title" title={trackingCopy.title} onBack={() => router.back()} />
        <LoadingIndicator />
      </ScreenContainer>
    );
  }

  if (storeFailed) {
    return (
      <ScreenContainer edges={["top", "bottom"]}>
        <PageHeader variant="title" title={trackingCopy.title} onBack={() => router.back()} />
        <View className="flex-1 justify-center">
          <CatalogueStatus
            title={`${trackingCopy.storeErrorTitle} ${trackingCopy.storeErrorBody}`}
            actionLabel="Try again"
            onAction={() => {
              void loadCredential();
            }}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (!hasCredential || !orderNumber) {
    return (
      <ScreenContainer edges={["top", "bottom"]}>
        <PageHeader variant="title" title={trackingCopy.title} onBack={() => router.back()} />
        <View className="flex-1 justify-center px-2">
          <CatalogueStatus title={`${trackingCopy.emptyTitle}. ${trackingCopy.emptyBody}`} />
        </View>
      </ScreenContainer>
    );
  }

  const result = query.data;
  const failure = result && !result.ok ? trackingErrorCopy(result.kind) : null;

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader
        variant="title"
        title={trackingCopy.title}
        subtitle={orderNumber}
        onBack={() => router.back()}
      />
      {query.isLoading && !result ? (
        <LoadingIndicator />
      ) : failure ? (
        <View className="flex-1 justify-center">
          <CatalogueStatus
            title={`${failure.title} ${failure.body}`}
            {...(failure.retry
              ? {
                  actionLabel: trackingCopy.refresh,
                  onAction: () => {
                    void refresh();
                  },
                }
              : {})}
          />
        </View>
      ) : result?.ok ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing && !query.isLoading}
              onRefresh={() => {
                void refresh();
              }}
              tintColor={colors.ink}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View className="mt-2 rounded-[18px] border border-ink bg-[#F1F9DA] px-4 py-5">
            <AppText family="body" weight="extrabold" className="text-[11px] uppercase text-secondary">
              {orderNumber}
            </AppText>
            <AppText family="display" weight="extrabold" className="mt-2 text-[24px] text-ink">
              {trackingStatusHeading(result.order.status)}
            </AppText>
            <AppText family="body" weight="regular" className="mt-2 text-[14px] leading-6 text-secondary">
              {trackingStatusExplanation(result.order.status)}
            </AppText>
            <AppText family="body" weight="semibold" className="mt-3 text-[13px] text-ink">
              {trackingStatusLabel(result.order.status)}
            </AppText>
          </View>

          {result.order.status === "cancelled" ? (
            <CancelledHistory
              at={cancelledEventTime(result.order.events)}
              events={result.order.events.map((event) => ({
                label: trackingStatusLabel(event.status),
                at: event.createdAt,
              }))}
            />
          ) : (
            <Timeline steps={buildTrackingTimeline(result.order)} />
          )}

          <AppText family="body" weight="regular" className="mt-4 text-[12px] text-muted">
            {`${trackingCopy.lastUpdated} ${formatTrackingTime(result.order.updatedAt)}`}
          </AppText>
        </ScrollView>
      ) : (
        <LoadingIndicator />
      )}
      <View className="border-t border-line bg-white px-5 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={trackingCopy.refresh}
          disabled={refreshing}
          onPress={() => {
            void refresh();
          }}
          className={`h-[52px] flex-row items-center justify-center gap-2 rounded-xl border border-ink bg-white ${
            refreshing ? "opacity-40" : ""
          }`}
        >
          <RefreshCw color={colors.ink} size={18} strokeWidth={2.2} />
          <AppText family="display" weight="bold" className="text-[16px] text-ink">
            {refreshing ? trackingCopy.refreshing : trackingCopy.refresh}
          </AppText>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View className="mt-4 rounded-[18px] border border-line bg-white px-4 py-4">
      {steps.map((step, index) => (
        <View key={step.status} className="flex-row">
          <View className="items-center">
            <StepMark state={step.state} />
            {index < steps.length - 1 ? (
              <View className={`w-[3px] flex-1 ${step.state === "pending" ? "bg-line" : "bg-ink"}`} />
            ) : null}
          </View>
          <View className={`ml-3 flex-1 ${index < steps.length - 1 ? "pb-4" : ""}`}>
            <AppText
              family="body"
              weight={step.state === "current" ? "extrabold" : step.state === "complete" ? "semibold" : "regular"}
              className={`text-[14px] ${step.state === "pending" ? "text-muted" : "text-ink"}`}
            >
              {step.label}
            </AppText>
            {step.occurredAt ? (
              <AppText family="body" weight="regular" className="mt-0.5 text-[12px] text-secondary">
                {formatTrackingTime(step.occurredAt)}
              </AppText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function StepMark({ state }: { state: TimelineStep["state"] }) {
  if (state === "complete") {
    return (
      <View className="h-[25px] w-[25px] items-center justify-center rounded-full bg-ink">
        <Check color={colors.white} size={14} strokeWidth={2.6} />
      </View>
    );
  }
  if (state === "current") {
    return <View className="h-[29px] w-[29px] rounded-full border-2 border-ink bg-lime" />;
  }
  return <View className="h-[25px] w-[25px] rounded-full border border-line bg-white" />;
}

function CancelledHistory({
  at,
  events,
}: {
  at: string | null;
  events: Array<{ label: string; at: string }>;
}) {
  return (
    <View className="mt-4 rounded-[18px] border border-line bg-white px-4 py-4">
      <AppText family="display" weight="extrabold" className="text-[16px] text-ink">
        {trackingStatusLabel("cancelled")}
      </AppText>
      {at ? (
        <AppText family="body" weight="regular" className="mt-1 text-[12px] text-secondary">
          {formatTrackingTime(at)}
        </AppText>
      ) : null}
      <View className="mt-3">
        {events.map((event) => (
          <AppText key={`${event.label}-${event.at}`} family="body" weight="regular" className="py-1 text-[13px] text-secondary">
            {`${event.label} · ${formatTrackingTime(event.at)}`}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }
  return null;
}
