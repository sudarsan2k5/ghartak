import { Text, type TextProps } from "react-native";

import { fontFamilyFor, type TextFamily, type TextWeight } from "@/theme/fonts";

type AppTextProps = TextProps & {
  family?: TextFamily;
  weight?: TextWeight;
};

export function AppText({
  family = "inter",
  weight = "regular",
  className,
  style,
  children,
  ...props
}: AppTextProps) {
  const content = typeof children === "string" || typeof children === "number" ? String(children) : "";
  return (
    <Text
      className={className}
      style={[{ fontFamily: fontFamilyFor(content, family, weight) }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}
