import type { CatalogueProductSort } from "@ghartak/contracts";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDownUp, Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueImage } from "@/components/CatalogueImage";
import { CatalogueProductCard } from "@/components/CatalogueProductCard";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { sortOptions } from "@/catalogue/display";
import { locationSubtitle, placeholderLocation } from "@/location/placeholder-location";
import { homeChrome } from "@/presentation/home";
import { useCategories, useProductCatalogue } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const railWidth = 84;
const gridPadding = 8;
const gridGap = 8;
const searchDelayMs = 350;

export default function CategoryBrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const categoryId = typeof params.id === "string" ? params.id : "";
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CatalogueProductSort>("name");
  const [inStock, setInStock] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    setQuery("");
    setSearch("");
  }, [categoryId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
    }, searchDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const products = useProductCatalogue({
    limit: 20,
    categoryId,
    sort,
    enabled: categoryId.length > 0,
    ...(search ? { search } : {}),
    ...(inStock ? { inStock: true } : {}),
  });

  const list = categories.data?.categories ?? [];
  const category = list.find((row) => row.id === categoryId) ?? null;
  const title = category?.name ?? "Category";
  const items = (products.data?.pages ?? []).flatMap((page) => page.products);
  const total = products.data?.pages[0]?.pagination.total ?? 0;
  const gridWidth = Math.min(width, 520) - railWidth;
  const productWidth = (gridWidth - gridPadding * 2 - gridGap) / 2;

  if (categories.data && !category) {
    return (
      <ScreenContainer>
        <PageHeader variant="title" title="Category" onBack={() => router.navigate("/categories")} />
        <CatalogueStatus
          title="This category is no longer available."
          actionLabel="All categories"
          onAction={() => {
            router.navigate("/categories");
          }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="min-h-0 flex-1">
        <PageHeader
          variant="title"
          title={title}
          subtitle={locationSubtitle(location, homeChrome.etaLabel)}
          onBack={() => {
            router.back();
          }}
        />
        <View className="px-5 pb-3">
          <SearchBar
            editable
            placeholder={`Search in ${title}`}
            value={query}
            onChangeText={setQuery}
            onClear={() => {
              setQuery("");
            }}
          />
        </View>
        <View className="min-h-0 flex-1 flex-row border-t border-line">
          <ScrollView style={{ width: railWidth, flexGrow: 0 }} className="bg-white" showsVerticalScrollIndicator={false}>
            {list.map((row) => {
              const selected = row.id === categoryId;
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={row.name}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    router.setParams({ id: row.id });
                  }}
                  className={`items-center border-l-[3px] px-1.5 py-2.5 ${selected ? "border-ink bg-page" : "border-transparent"}`}
                >
                  <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-page">
                    {row.imageDeliveryPath ? (
                      <CatalogueImage deliveryPath={row.imageDeliveryPath} alt={row.name} />
                    ) : (
                      <AppText family="jakarta" weight="extrabold" className="text-[16px] text-ink">
                        {row.name.trim().slice(0, 1).toUpperCase()}
                      </AppText>
                    )}
                  </View>
                  <AppText
                    family="inter"
                    weight={selected ? "extrabold" : "regular"}
                    numberOfLines={2}
                    className="mt-1 text-center text-[10px] leading-[1.2] text-ink"
                  >
                    {row.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
          <View className="min-h-0 flex-1">
            <View className="flex-row items-center justify-between gap-2 px-2.5 py-2.5">
              <View className="min-w-0 flex-1">
                <AppText family="jakarta" weight="extrabold" numberOfLines={1} className="text-[16px] text-ink">
                  {title}
                </AppText>
                <AppText family="inter" weight="regular" className="text-[10px] text-muted">
                  {products.data ? `${total} ${total === 1 ? "product" : "products"}` : " "}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: inStock }}
                accessibilityLabel="Show only products in stock"
                onPress={() => {
                  setInStock((value) => !value);
                }}
                className={`h-8 justify-center rounded-lg border px-2 ${inStock ? "border-ink bg-lime" : "border-line bg-white"}`}
              >
                <AppText family="inter" weight="semibold" className="text-[11px] text-ink">
                  In stock
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sort products"
                onPress={() => {
                  setSortOpen(true);
                }}
                className="h-8 flex-row items-center gap-1 rounded-lg border border-line bg-white px-2"
              >
                <ArrowDownUp color={colors.ink} size={12} strokeWidth={2.2} />
                <AppText family="inter" weight="semibold" className="text-[11px] text-ink">
                  Sort
                </AppText>
              </Pressable>
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
            {products.data && items.length === 0 ? (
              <CatalogueStatus title={search || inStock ? "No products match." : "Nothing is listed in this category yet."} />
            ) : null}
            {items.length > 0 ? (
              <View className="min-h-0 flex-1">
                <FlashList
                  data={items}
                  numColumns={2}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: gridPadding - gridGap / 2, paddingBottom: 16 }}
                  refreshControl={
                    <RefreshControl
                      refreshing={products.isRefetching && !products.isFetchingNextPage}
                      onRefresh={() => {
                        void products.refetch();
                        void categories.refetch();
                      }}
                    />
                  }
                  onEndReached={() => {
                    if (products.hasNextPage && !products.isFetchingNextPage) {
                      void products.fetchNextPage();
                    }
                  }}
                  renderItem={({ item }) => (
                    <View style={{ padding: gridGap / 2 }}>
                      <CatalogueProductCard product={item} width={productWidth} />
                    </View>
                  )}
                />
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View className="bg-page" style={{ flexShrink: 0 }}>
        <BasketBar />
      </View>
      <Modal
        transparent
        visible={sortOpen}
        animationType="fade"
        onRequestClose={() => {
          setSortOpen(false);
        }}
      >
        <Pressable
          accessibilityLabel="Close sort options"
          className="flex-1 justify-end bg-black/30"
          onPress={() => {
            setSortOpen(false);
          }}
        >
          <View className="rounded-t-[18px] bg-white px-5 pb-8 pt-4">
            <AppText family="jakarta" weight="extrabold" className="mb-2 text-[16px] text-ink">
              Sort by
            </AppText>
            {sortOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === option.value }}
                onPress={() => {
                  setSort(option.value);
                  setSortOpen(false);
                }}
                className="h-12 flex-row items-center justify-between"
              >
                <AppText family="inter" weight={sort === option.value ? "extrabold" : "regular"} className="text-[14px] text-ink">
                  {option.label}
                </AppText>
                {sort === option.value ? <Check color={colors.ink} size={18} strokeWidth={2.4} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
