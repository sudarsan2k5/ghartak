import { Package } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp, View, type ViewStyle } from "react-native";

import { imageBaseUrl } from "@/api/config";
import { resolveCatalogueImage } from "@/api/images";
import { colors } from "@/theme/tokens";

type CatalogueImageProps = {
  deliveryPath: string | null;
  alt: string | null;
  style?: StyleProp<ImageStyle>;
};

export function CatalogueImage({ deliveryPath, alt, style }: CatalogueImageProps) {
  const [failed, setFailed] = useState(false);
  const uri = resolveCatalogueImage(deliveryPath, imageBaseUrl(process.env.EXPO_PUBLIC_IMAGE_BASE_URL));
  useEffect(() => {
    setFailed(false);
  }, [deliveryPath]);
  const label = alt ?? "Product photo unavailable";

  if (!uri || failed) {
    return (
      <View
        accessibilityLabel={label}
        style={style as StyleProp<ViewStyle>}
        className="h-full w-full items-center justify-center bg-page"
      >
        <Package color={colors.muted} size={28} strokeWidth={1.8} />
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={alt ?? "Product photo"}
      source={{ uri }}
      resizeMode="contain"
      onError={() => {
        setFailed(true);
      }}
      style={style}
      className="h-full w-full"
    />
  );
}
