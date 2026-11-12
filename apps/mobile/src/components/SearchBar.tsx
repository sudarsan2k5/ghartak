import { Mic, Search, X } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

import { colors } from "@/theme/tokens";

type SearchBarProps = {
  placeholder: string;
  value?: string;
  onChangeText?: (value: string) => void;
  onClear?: () => void;
  editable?: boolean;
  onPress?: () => void;
  autoFocus?: boolean;
  onSubmit?: () => void;
};

export function SearchBar({
  placeholder,
  value,
  onChangeText,
  onClear,
  editable = false,
  onPress,
  autoFocus = false,
  onSubmit,
}: SearchBarProps) {
  const field = (
    <View className="h-[46px] flex-row items-center rounded-xl border border-line bg-white px-3.5">
      <Search color={colors.muted} size={18} strokeWidth={2} />
      <TextInput
        accessibilityLabel="Search"
        editable={editable}
        pointerEvents={editable ? "auto" : "none"}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        className="ml-2.5 flex-1 text-[14px] text-ink"
        style={{ fontFamily: "Figtree_400Regular" }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
      />
      {editable && value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear} hitSlop={8}>
          <X color={colors.muted} size={16} strokeWidth={2.2} />
        </Pressable>
      ) : (
        <>
          <View className="mx-2.5 h-5 w-px bg-line" />
          <Mic color={colors.muted} size={18} strokeWidth={2} />
        </>
      )}
    </View>
  );

  if (!editable && onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Search the catalogue" onPress={onPress}>
        {field}
      </Pressable>
    );
  }

  return field;
}
