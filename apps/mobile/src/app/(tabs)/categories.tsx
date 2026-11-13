import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LayoutGrid, RefreshCw } from "lucide-react-native";
import { useEffect } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { CategoryTile, FeaturedCategoryCard } from "@/components/CategoryTiles";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { SkeletonBlock } from "@/components/Skeleton";
import { placeholderLocation } from "@/location/placeholder-location";
import { deliveryMinutes, homeChrome } from "@/presentation/home";
import { prefetchCategoryProducts, useCategories } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";

const columns = 3;
const gutter = 20;
const gap = 12;

export default function CategoriesScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const queryClient = useQueryClient();
  const list = categories.data?.categories ?? [];
  const categoryIds = list.map((row) => row.id).join(",");
  // Warm each category's first page so opening one shows products straight away.
  useEffect(() => {
    if (categoryIds) {
      prefetchCategoryProducts(queryClient, categoryIds.split(","));
    }
  }, [categoryIds, queryClient]);

  const tileWidth = (Math.min(width, 520) - gutter * 2 - gap * (columns - 1)) / columns;
  // The first category, in the order set in the admin, gets the featured card.
  const [featured, ...rest] = list;

  function open(id: string) {
    router.push({ pathname: "/category/[id]", params: { id } });
  }

  return (
    <ScreenContainer>
      <View className="min-h-0 flex-1">
        <PageHeader variant="title" title="All categories" subtitle={`${homeChrome.etaLabel} · ${location.label}, ${location.line}`} />
        <View className="px-5 pb-3">
          <SearchBar
            placeholder={homeChrome.searchPlaceholder}
            onPress={() => {
              router.push("/search");
            }}
          />
        </View>

        {categories.isPending ? <CategoriesSkeleton tileWidth={tileWidth} /> : null}
        {categories.isError ? (
          <CatalogueStatus
            icon={RefreshCw}
            title="Categories could not be loaded."
            body="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => {
              void categories.refetch();
            }}
          />
        ) : null}
        {categories.data && list.length === 0 ? (
          <CatalogueStatus icon={LayoutGrid} title="No categories yet" body="Categories will appear here as soon as they are added." />
        ) : null}

        {featured ? (
          <ScrollView
            className="min-h-0 flex-1"
            contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={categories.isRefetching}
                onRefresh={() => {
                  void categories.refetch();
                }}
              />
            }
          >
            <FeaturedCategoryCard
              name={featured.name}
              imagePath={featured.imageDeliveryPath}
              minutes={deliveryMinutes}
              onPress={() => open(featured.id)}
            />

            {rest.length > 0 ? (
              <>
                <View className="mb-3 mt-6 flex-row items-end justify-between">
                  <AppText family="display" weight="bold" className="text-[18px] leading-[23px] text-ink">
                    Shop by category
                  </AppText>
                  <AppText family="body" weight="medium" className="text-[12px] leading-[16px] text-muted">
                    {`${list.length} ${list.length === 1 ? "aisle" : "aisles"}`}
                  </AppText>
                </View>
                <View className="flex-row flex-wrap" style={{ columnGap: gap, rowGap: 16 }}>
                  {rest.map((category, index) => (
                    <CategoryTile
                      key={category.id}
                      name={category.name}
                      imagePath={category.imageDeliveryPath}
                      index={index}
                      width={tileWidth}
                      onPress={() => open(category.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
      <View className="bg-page" style={{ flexShrink: 0 }}>
        <BasketBar />
      </View>
    </ScreenContainer>
  );
}

function CategoriesSkeleton({ tileWidth }: { tileWidth: number }) {
  return (
    <View className="px-5 pt-1" accessibilityLabel="Loading categories" accessibilityRole="progressbar">
      <SkeletonBlock width="100%" height={132} radius={20} />
      <SkeletonBlock width={150} height={18} style={{ marginTop: 24, marginBottom: 12 }} />
      <View className="flex-row flex-wrap" style={{ columnGap: gap, rowGap: 16 }}>
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={{ width: tileWidth }}>
            <SkeletonBlock width="100%" height={tileWidth} radius={18} />
            <SkeletonBlock width="70%" height={12} style={{ marginTop: 8, alignSelf: "center" }} />
          </View>
        ))}
      </View>
    </View>
  );
}
