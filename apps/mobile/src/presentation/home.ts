import type { ImageSourcePropType } from "react-native";

export const homeChrome = {
  etaLabel: "8 minutes",
  searchPlaceholder: "Search for atta, milk, chips…",
  categoriesTitle: "Your daily everything",
  productsTitle: "On your daily list",
  campaign: {
    eyebrow: "GOOD MORNING, NEIGHBOUR",
    headline: "Big breakfast.\nTiny wait.",
    support: "Fresh starts, from ₹28",
    image: require("../../assets/catalog/campaign-breakfast.png") as ImageSourcePropType,
  },
} as const;

