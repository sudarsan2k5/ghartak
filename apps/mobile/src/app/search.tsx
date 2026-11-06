import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueProductCard } from "@/components/CatalogueProductCard";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { useProductCatalogue } from "@/query/catalogue";

const searchDelayMs = 350;

export default function SearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const trimmed = debounced.trim();
  const results = useProductCatalogue({
    limit: 20,
    search: trimmed,
    enabled: trimmed.length > 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, searchDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value]);

  const sourceProducts = (results.data?.pages ?? []).flatMap((page) => page.products);
  const contentWidth = Math.min(width, 520) - 40;
  const productWidth = (contentWidth - 12) / 2;

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader variant="title" title="Search" onBack={() => router.back()} />
      <View className="px-5 pb-3">
        <SearchBar
          placeholder="Search for atta, milk, chips…"
          editable
          value={value}
          onChangeText={setValue}
          onClear={() => {
            setValue("");
            setDebounced("");
          }}
        />
      </View>
      {trimmed.length === 0 ? <CatalogueStatus title="Search the Ghartak catalogue." /> : null}
      {trimmed.length > 0 && results.isPending ? <LoadingIndicator /> : null}
      {trimmed.length > 0 && results.isError ? (
        <CatalogueStatus
          title="Search could not be completed."
          actionLabel="Try again"
          onAction={() => {
            void results.refetch();
          }}
        />
      ) : null}
      {trimmed.length > 0 && results.data && sourceProducts.length === 0 ? (
        <CatalogueStatus title="No products match that search." />
      ) : null}
      {sourceProducts.length > 0 ? (
        <View className="min-h-0 flex-1">
          <FlashList
            data={sourceProducts}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}
            onEndReached={() => {
              if (results.hasNextPage && !results.isFetchingNextPage) {
                void results.fetchNextPage();
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
      <BasketBar />
    </ScreenContainer>
  );
}
