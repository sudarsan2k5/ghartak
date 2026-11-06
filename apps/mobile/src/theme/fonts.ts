import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
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
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

export const fontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
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

export type TextFamily = "inter" | "jakarta";
export type TextWeight = "regular" | "medium" | "semibold" | "bold" | "extrabold" | "black";

const interFaces: Record<TextWeight, string> = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
  black: "Inter_900Black",
};

const jakartaFaces: Record<TextWeight, string> = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
  black: "PlusJakartaSans_800ExtraBold",
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

export function fontFamilyFor(text: string, family: TextFamily, weight: TextWeight): string {
  if (devanagari.test(text)) {
    return devanagariFaces[weight];
  }
  if (oriya.test(text)) {
    return oriyaFaces[weight];
  }
  return family === "jakarta" ? jakartaFaces[weight] : interFaces[weight];
}
