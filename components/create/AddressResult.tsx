import { Pressable, Text } from "react-native";
import { useTheme } from "../../context/theme";
import { formatUSAddress } from "../../utils/address";

export function AddressResult({ item, isLast, onPress }: { item: any; isLast: boolean; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Pressable
      style={[
        {
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        isLast ? { borderBottomWidth: 0 } : null,
      ]}
      onPress={onPress}
    >
      <Text style={{ color: colors.text, fontFamily: fonts.body, fontWeight: "700", fontSize: 13 }}>
        {formatUSAddress(item.address)}
      </Text>
    </Pressable>
  );
}
