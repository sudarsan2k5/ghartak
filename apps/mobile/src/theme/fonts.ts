import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  Figtree_900Black,
} from "@expo-google-fonts/figtree";
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
  NotoSansDevanagari_800ExtraBold,
  NotoSansDevanagari_900Black,
} from "@expo-google-fonts/noto-sans-devanagari";
import {
  NotoSansOriya_400Regular,
  NotoSansOriya_500Medium,
  NotoSansOriya_600SemiBold,
  NotoSansOriya_700Bold,
  NotoSansOriya_800ExtraBold,
  NotoSansOriya_900Black,
} from "@expo-google-fonts/noto-sans-oriya";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from "@expo-google-fonts/outfit";

export const fontAssets = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  Figtree_900Black,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
  NotoSansDevanagari_800ExtraBold,
  NotoSansDevanagari_900Black,
  NotoSansOriya_400Regular,
  NotoSansOriya_500Medium,
  NotoSansOriya_600SemiBold,
  NotoSansOriya_700Bold,
  NotoSansOriya_800ExtraBold,
  NotoSansOriya_900Black,
} as const;

/** `body` is Figtree, for running text, prices, and controls. `display` is Outfit, for headings and labels. */
export type TextFamily = "body" | "display";
export type TextWeight = "regular" | "medium" | "semibold" | "bold" | "extrabold" | "black";

const bodyFaces: Record<TextWeight, string> = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  extrabold: "Figtree_800ExtraBold",
  black: "Figtree_900Black",
};

const displayFaces: Record<TextWeight, string> = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
  extrabold: "Outfit_800ExtraBold",
  black: "Outfit_900Black",
};

const devanagariFaces: Record<TextWeight, string> = {
  regular: "NotoSansDevanagari_400Regular",
  medium: "NotoSansDevanagari_500Medium",
  semibold: "NotoSansDevanagari_600SemiBold",
  bold: "NotoSansDevanagari_700Bold",
  extrabold: "NotoSansDevanagari_800ExtraBold",
  black: "NotoSansDevanagari_900Black",
};

const oriyaFaces: Record<TextWeight, string> = {
  regular: "NotoSansOriya_400Regular",
  medium: "NotoSansOriya_500Medium",
  semibold: "NotoSansOriya_600SemiBold",
  bold: "NotoSansOriya_700Bold",
  extrabold: "NotoSansOriya_800ExtraBold",
  black: "NotoSansOriya_900Black",
};

const devanagari = /[\u0900-\u097F]/;
const oriya = /[\u0B00-\u0B7F]/;

/** The face for this text, switching to Noto for Hindi and Odia, which the Latin fonts do not cover. */
export function fontFamilyFor(text: string, family: TextFamily, weight: TextWeight): string {
  if (devanagari.test(text)) {
    return devanagariFaces[weight];
  }
  if (oriya.test(text)) {
    return oriyaFaces[weight];
  }
  return family === "display" ? displayFaces[weight] : bodyFaces[weight];
}
