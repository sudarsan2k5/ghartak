import { useRouter } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";

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
import { useCategories, useProductPage } from "@/query/catalogue";
import { AppText } from "@/theme/AppText";
import { colors } from "@/theme/tokens";

export default function HomeScreen() {
  const router = useRouter();
  const location = placeholderLocation();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const products = useProductPage({ limit: 20, page: 1 });

  const contentWidth = Math.min(width, 520) - 40;
  const productWidth = (contentWidth - 12) / 2;
  const tileWidth = (contentWidth - 30) / 4;
  const categoryCount = categories.data?.categories.length ?? 0;
  const categoryRows = Math.max(1, Math.ceil(categoryCount / 4));
  const categoryListHeight = (tileWidth * (65 / 76) + 40) * categoryRows;
  const sourceProducts = products.data?.products ?? [];

  return (
    <ScreenContainer>
      <View className="min-h-0 flex-1" style={{ overflow: "hidden" }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <View className="w-full max-w-[520px] self-center">
            <PageHeader
              variant="home"
              etaLabel={homeChrome.etaLabel}
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
                  <AppText family="jakarta" weight="bold" className="text-[9px] tracking-wide text-lime">
                    {homeChrome.campaign.eyebrow}
                  </AppText>
                  <AppText
                    family="jakarta"
                    weight="extrabold"
                    className="mt-2 text-[26px] leading-[1.05] text-white"
                  >
                    {homeChrome.campaign.headline}
                  </AppText>
                  <AppText family="inter" weight="regular" className="mt-2 text-[11px] text-white">
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
              {categories.isPending ? <LoadingIndicator compact /> : null}
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
                <View style={{ height: categoryListHeight, marginHorizontal: -5 }}>
                  <FlashList
                    data={categories.data.categories}
                    numColumns={4}
                    scrollEnabled={false}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <CategoryCard
                        label={item.name}
                        onPress={() => {
                          router.push({ pathname: "/categories", params: { categoryId: item.id } });
                        }}
                      />
                    )}
                  />
                </View>
              ) : null}
              <SectionTitle
                title={homeChrome.productsTitle}
                onSeeAll={() => {
                  router.push("/categories");
                }}
              />
            </View>
            {products.isPending ? <LoadingIndicator compact /> : null}
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
              <CatalogueStatus title="No products are available yet." />
            ) : null}
            {sourceProducts.length > 0 ? (
              <View style={{ height: 248, marginBottom: 8, overflow: "hidden" }}>
                <FlashList
                  horizontal
                  data={sourceProducts}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                  renderItem={({ item }) => <CatalogueProductCard product={item} width={productWidth} />}
                />
              </View>
            ) : null}
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
      <AppText family="jakarta" weight="extrabold" className="text-[19px] text-ink">
        {title}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onSeeAll} className="flex-row items-center">
        <AppText family="inter" weight="semibold" className="text-[12px] text-ink">
          See all
        </AppText>
        <ArrowRight color={colors.ink} size={14} strokeWidth={2.2} style={{ marginLeft: 2 }} />
      </Pressable>
    </View>
  );
}
