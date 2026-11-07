import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { CategoryCard } from "@/components/CategoryCard";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { placeholderLocation } from "@/location/placeholder-location";
import { homeChrome } from "@/presentation/home";
import { useCategories } from "@/query/catalogue";

const columns = 3;

export default function CategoriesScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const tileWidth = (Math.min(width, 520) - 30) / columns;

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
        {categories.isPending ? <LoadingIndicator /> : null}
        {categories.isError ? (
          <CatalogueStatus
            title="Categories could not be loaded."
            actionLabel="Try again"
            onAction={() => {
              void categories.refetch();
            }}
          />
        ) : null}
        {categories.data && categories.data.categories.length === 0 ? (
          <CatalogueStatus title="No categories are available yet." />
        ) : null}
        {categories.data && categories.data.categories.length > 0 ? (
          <ScrollView
            className="min-h-0 flex-1"
            contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 15, paddingBottom: 20, rowGap: 16 }}
            refreshControl={
              <RefreshControl
                refreshing={categories.isRefetching}
                onRefresh={() => {
                  void categories.refetch();
                }}
              />
            }
          >
            {categories.data.categories.map((category) => (
              <View key={category.id} style={{ width: tileWidth }}>
                <CategoryCard
                  large
                  label={category.name}
                  imagePath={category.imageDeliveryPath}
                  onPress={() => {
                    router.push({ pathname: "/category/[id]", params: { id: category.id } });
                  }}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View className="bg-page" style={{ flexShrink: 0 }}>
        <BasketBar />
      </View>
    </ScreenContainer>
  );
}
