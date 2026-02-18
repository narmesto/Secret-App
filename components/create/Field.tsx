import { Text, View } from "react-native";
import { useTheme } from "../../context/theme";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          color: colors.muted,
          fontFamily: fonts.body,
          fontWeight: "700",
          fontSize: 13,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
