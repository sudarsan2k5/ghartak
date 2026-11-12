import type { ImageSourcePropType } from "react-native";

/** The delivery promise shown across the app. */
export const deliveryMinutes = 15;

export const homeChrome = {
  etaLabel: `${deliveryMinutes} minutes`,
  /** Short form for the chip on product cards. */
  cardEtaLabel: `${deliveryMinutes} MINS`,
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

