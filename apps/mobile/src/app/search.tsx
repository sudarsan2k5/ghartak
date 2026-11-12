import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Clock, LayoutGrid, RefreshCw, SearchX } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { BasketBar } from "@/components/BasketBar";
import { CatalogueProductCard } from "@/components/CatalogueProductCard";
import { CatalogueStatus } from "@/components/CatalogueStatus";
import { PageHeader } from "@/components/PageHeader";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SearchBar } from "@/components/SearchBar";
import { ProductGridSkeleton } from "@/components/Skeleton";
import { useCategories, useProductCatalogue } from "@/query/catalogue";
import { useRecentSearches } from "@/search/use-recent-searches";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

const searchDelayMs = 350;
const rememberDelayMs = 1500;

export default function SearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const trimmed = debounced.trim();
  const recent = useRecentSearches();
  const categories = useCategories();
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
  const hasResults = sourceProducts.length > 0;
  const { remember } = recent;

  // Only settled searches that found something are worth offering again, so half-typed words are not saved.
  useEffect(() => {
    if (trimmed.length === 0 || !hasResults) {
      return;
    }
    const timer = setTimeout(() => remember(trimmed), rememberDelayMs);
    return () => clearTimeout(timer);
  }, [trimmed, hasResults, remember]);

  function runSearch(term: string) {
    setValue(term);
    setDebounced(term);
  }

  return (
    <ScreenContainer edges={["top", "bottom"]}>
      <PageHeader variant="title" title="Search" onBack={() => router.back()} />
      <View className="px-5 pb-3">
        <SearchBar
          placeholder="Search for atta, milk, chips…"
          editable
          autoFocus
          value={value}
          onChangeText={setValue}
          onSubmit={() => {
            setDebounced(value);
            if (value.trim()) {
              remember(value);
            }
          }}
          onClear={() => {
            setValue("");
            setDebounced("");
          }}
        />
      </View>

      {trimmed.length === 0 ? (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {recent.recent.length > 0 ? (
            <Animated.View entering={FadeIn.duration(200)} className="px-5 pt-2">
              <View className="mb-3 flex-row items-center justify-between">
                <AppText family="display" weight="bold" className="text-[15px] text-ink">
                  Recent searches
                </AppText>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={recent.clear}>
                  <AppText family="body" weight="semibold" className="text-[12px] text-secondary">
                    Clear
                  </AppText>
                </Pressable>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {recent.recent.map((term) => (
                  <Chip key={term} label={term} icon="recent" onPress={() => runSearch(term)} />
                ))}
              </View>
            </Animated.View>
          ) : null}

          {categories.data && categories.data.categories.length > 0 ? (
            <Animated.View entering={FadeIn.duration(200)} className="px-5 pt-6">
              <AppText family="display" weight="bold" className="mb-3 text-[15px] text-ink">
                Browse categories
              </AppText>
              <View className="flex-row flex-wrap gap-2">
                {categories.data.categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    icon="category"
                    onPress={() => router.push({ pathname: "/category/[id]", params: { id: category.id } })}
                  />
                ))}
              </View>
            </Animated.View>
          ) : null}

          {recent.recent.length === 0 && !categories.data?.categories.length ? (
            <CatalogueStatus
              icon={SearchX}
              title="Find anything in a few letters"
              body="Results appear as you type. Try “onion” or “oil”."
            />
          ) : null}
        </ScrollView>
      ) : null}

      {trimmed.length > 0 && results.isPending ? (
        <View className="pt-1">
          <ProductGridSkeleton width={productWidth} count={4} />
        </View>
      ) : null}
      {trimmed.length > 0 && results.isError ? (
        <CatalogueStatus
          icon={RefreshCw}
          title="Search could not be completed"
          body="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => {
            void results.refetch();
          }}
        />
      ) : null}
      {trimmed.length > 0 && results.data && !hasResults ? (
        <CatalogueStatus
          icon={SearchX}
          title={`No results for “${trimmed}”`}
          body="Try a shorter word, or browse the categories."
          actionLabel="Browse categories"
          onAction={() => router.push("/categories")}
        />
      ) : null}
      {hasResults ? (
        <View className="min-h-0 flex-1">
          <FlashList
            data={sourceProducts}
            numColumns={2}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
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

function Chip({ label, icon, onPress }: { label: string; icon: "recent" | "category"; onPress: () => void }) {
  const Icon = icon === "recent" ? Clock : LayoutGrid;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === "recent" ? `Search again for ${label}` : `Open ${label}`}
      onPress={onPress}
      className="h-9 flex-row items-center gap-1.5 rounded-full border border-line bg-white px-3.5 active:opacity-70"
    >
      <Icon color={colors.muted} size={14} strokeWidth={2} />
      <AppText family="body" weight="medium" className="text-[13px] text-ink">
        {label}
      </AppText>
    </Pressable>
  );
}
