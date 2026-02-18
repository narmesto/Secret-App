import { Pressable, Text } from "react-native";
import { useTheme } from "../../context/theme";

export function CategoryChip({ name, active, onPress }: { name: string; active: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 99,
          borderWidth: 1,
        },
        active
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text
        style={[
          { fontFamily: fonts.body, fontWeight: "700", fontSize: 13 },
          { color: active ? "#fff" : colors.text },
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}
