import { useRouter } from "expo-router";
import { ArrowRight, PackageOpen, RefreshCw } from "lucide-react-native";
import { Image, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueProductCard } from "@/components/CatalogueProductCard";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { CategoryCard } from "@/components/CategoryCard";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { CategoryRowSkeleton, ProductGridSkeleton, ProductRailSkeleton } from "@/components/Skeleton";
import { placeholderLocation } from "@/location/placeholder-location";
import { deliveryMinutes, homeChrome } from "@/presentation/home";
import { useDailyTiles, useProductCatalogue } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const newArrivalsThreshold = 8;

export default function HomeScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const tiles = useDailyTiles();
  const products = useProductCatalogue({ limit: 20 });
  const newest = useProductCatalogue({ limit: 10, sort: "newest" });

  const contentWidth = Math.min(width, 520) - 40;
  const productWidth = (contentWidth - 12) / 2;
  const sourceProducts = (products.data?.pages ?? []).flatMap((page) => page.products);
  const newestProducts = newest.data?.pages[0]?.products ?? [];
  const railWidth = Math.min(156, productWidth);
  // A small catalogue would show the same products twice, so the rail waits until there is more to show.
  const showNewArrivals = (products.data?.pages[0]?.pagination.total ?? 0) > newArrivalsThreshold;

  return (
    <ScreenContainer>
      <View className="min-h-0 flex-1" style={{ overflow: "hidden" }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={tiles.isRefetching || (products.isRefetching && !products.isFetchingNextPage)}
              onRefresh={() => {
                void tiles.refetch();
                void products.refetch();
                void newest.refetch();
              }}
            />
          }
          scrollEventThrottle={200}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
            const nearEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 400;
            if (nearEnd && products.hasNextPage && !products.isFetchingNextPage) {
              void products.fetchNextPage();
            }
          }}
        >
          <View className="w-full max-w-[520px] self-center">
            <PageHeader
              variant="home"
              etaMinutes={deliveryMinutes}
              addressLabel={location.label}
              addressLine={location.line}
              onAccountPress={() => {
                router.push("/profile");
              }}
            />
            <View className="gap-5 px-5 pb-4">
              <SearchBar
                placeholder={homeChrome.searchPlaceholder}
                onPress={() => {
                  router.push("/search");
                }}
              />
              <Animated.View
                entering={FadeInDown.duration(420)}
                className="h-[142px] flex-row items-center overflow-hidden rounded-[18px] bg-ink p-4"
              >
                <View className="flex-1 pr-3">
                  <AppText family="display" weight="bold" className="text-[9px] tracking-wide text-lime">
                    {homeChrome.campaign.eyebrow}
                  </AppText>
                  <AppText
                    family="display"
                    weight="extrabold"
                    className="mt-2 text-[26px] leading-[29px] text-white"
                  >
                    {homeChrome.campaign.headline}
                  </AppText>
                  <AppText family="body" weight="regular" className="mt-2 text-[11px] text-white">
                    {homeChrome.campaign.support}
                  </AppText>
                </View>
                <Image
                  source={homeChrome.campaign.image}
                  resizeMode="cover"
                  style={{ width: 120, height: 110, borderRadius: 12 }}
                />
              </Animated.View>
              <SectionTitle
                title={homeChrome.categoriesTitle}
                onSeeAll={() => {
                  router.push("/categories");
                }}
              />
              {tiles.isPending ? <CategoryRowSkeleton /> : null}
              {tiles.isError ? (
                <CatalogueStatus
                  icon={RefreshCw}
                  title="Categories could not be loaded."
                  actionLabel="Try again"
                  onAction={() => {
                    void tiles.refetch();
                  }}
                />
              ) : null}
              {tiles.data ? (
                <View className="flex-row" style={{ marginHorizontal: -5 }}>
                  {tiles.data.tiles.map((tile) => (
                    <View key={tile.position} style={{ flex: 1 }}>
                      <CategoryCard
                        label={tile.label}
                        imagePath={tile.imageDeliveryPath}
                        onPress={() => {
                          router.push(
                            tile.categoryId ? { pathname: "/category/[id]", params: { id: tile.categoryId } } : "/categories",
                          );
                        }}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
              {showNewArrivals ? (
                <SectionTitle
                  title="New arrivals"
                  onSeeAll={() => {
                    router.push("/categories");
                  }}
                />
              ) : null}
            </View>
            {showNewArrivals ? (
              <View className="pb-5">
                {newest.isPending ? <ProductRailSkeleton width={railWidth} /> : null}
                {newestProducts.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, columnGap: 12 }}
                  >
                    {newestProducts.map((item) => (
                      <CatalogueProductCard key={item.id} product={item} width={railWidth} />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            <View className="px-5 pb-4 pt-1">
              <SectionTitle
                title={homeChrome.productsTitle}
                onSeeAll={() => {
                  router.push("/categories");
                }}
              />
            </View>
            {products.isPending ? <ProductGridSkeleton width={productWidth} count={4} /> : null}
            {products.isError ? (
              <CatalogueStatus
                icon={RefreshCw}
                title="Products could not be loaded."
                actionLabel="Try again"
                onAction={() => {
                  void products.refetch();
                }}
              />
            ) : null}
            {products.data && sourceProducts.length === 0 ? (
              <CatalogueStatus icon={PackageOpen} title="Fresh stock is on its way" body="No products are available yet. Pull down to check again." />
            ) : null}
            {sourceProducts.length > 0 ? (
              <View className="flex-row flex-wrap px-5" style={{ columnGap: 12, rowGap: 12 }}>
                {sourceProducts.map((item) => (
                  <CatalogueProductCard key={item.id} product={item} width={productWidth} />
                ))}
              </View>
            ) : null}
            {products.isFetchingNextPage ? <LoadingIndicator compact /> : null}
          </View>
        </ScrollView>
      </View>
      <View className="bg-page" style={{ flexShrink: 0 }}>
        <BasketBar />
      </View>
    </ScreenContainer>
  );
}

function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText family="display" weight="extrabold" className="text-[19px] text-ink">
        {title}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8} className="flex-row items-center active:opacity-60">
        <AppText family="body" weight="semibold" className="text-[12px] text-ink">
          See all
        </AppText>
        <ArrowRight color={colors.ink} size={14} strokeWidth={2.2} style={{ marginLeft: 2 }} />
      </Pressable>
    </View>
  );
}
