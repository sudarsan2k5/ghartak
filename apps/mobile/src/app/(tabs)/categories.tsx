import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueProductCard } from "@/components/CatalogueProductCard";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { CategoryCard } from "@/components/CategoryCard";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { placeholderLocation } from "@/location/placeholder-location";
import { homeChrome } from "@/presentation/home";
import { useCategories, useProductCatalogue } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";

export default function CategoriesScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const params = useLocalSearchParams<{ categoryId?: string | string[] }>();
  const categoryParam = typeof params.categoryId === "string" ? params.categoryId : null;
  const [selectedId, setSelectedId] = useState<string | null>(categoryParam);
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const products = useProductCatalogue({
    limit: 20,
    ...(selectedId ? { categoryId: selectedId } : {}),
  });
  useEffect(() => {
    setSelectedId(categoryParam);
  }, [categoryParam]);

  const selected = categories.data?.categories.find((category) => category.id === selectedId) ?? null;
  const contentWidth = Math.min(width, 520) - 40;
  const productWidth = (contentWidth - 12) / 2;
  const sourceProducts = (products.data?.pages ?? []).flatMap((page) => page.products);
  const subtitle = `${homeChrome.etaLabel} · ${location.label}, ${location.line}`;

  return (
    <ScreenContainer>
      <View className="min-h-0 flex-1">
        <PageHeader variant="title" title={selected?.name ?? "Categories"} subtitle={subtitle} />
        <View className="px-5 pb-3">
          <SearchBar
            placeholder={selected ? `Search in ${selected.name}` : homeChrome.searchPlaceholder}
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
        {categories.data ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 15 }}
          >
            <View style={{ width: 76 }}>
              <CategoryCard
                label="All"
                selected={selectedId === null}
                onPress={() => {
                  setSelectedId(null);
                }}
              />
            </View>
            {categories.data.categories.map((category) => (
              <View key={category.id} style={{ width: 76 }}>
                <CategoryCard
                  label={category.name}
                  selected={category.id === selectedId}
                  onPress={() => {
                    setSelectedId(category.id);
                  }}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
        <View className="flex-row items-end justify-between px-5 pb-2 pt-3">
          <AppText family="jakarta" weight="extrabold" className="text-[17px] text-ink">
            {selected?.name ?? "All products"}
          </AppText>
          <AppText family="inter" weight="regular" className="text-[10px] text-muted">
            {products.data ? `${products.data.pages[0]?.pagination.total ?? 0} products` : ""}
          </AppText>
        </View>
        {products.isPending ? <LoadingIndicator /> : null}
        {products.isError ? (
          <CatalogueStatus
            title="Products could not be loaded."
            actionLabel="Try again"
            onAction={() => {
              void products.refetch();
            }}
          />
        ) : null}
        {products.data && sourceProducts.length === 0 ? (
          <CatalogueStatus title="Nothing is listed in this category yet." />
        ) : null}
        {sourceProducts.length > 0 ? (
          <View className="min-h-0 flex-1">
          <FlashList
            data={sourceProducts}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 20 }}
            onEndReached={() => {
              if (products.hasNextPage && !products.isFetchingNextPage) {
                void products.fetchNextPage();
              }
            }}
            renderItem={({ item }) => (
              <View className="p-1.5">
                <CatalogueProductCard product={item} width={productWidth} />
              </View>
            )}
          />
          </View>
        ) : null}
      </View>
      <View className="bg-page" style={{ flexShrink: 0 }}>
        <BasketBar />
      </View>
    </ScreenContainer>
  );
}
