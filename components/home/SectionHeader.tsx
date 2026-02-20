import { Text, View } from "react-native";
import { useTheme } from "../../context/theme";

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ paddingTop: 24, paddingBottom: 12, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.text }}>
        {title.toLowerCase()}
      </Text>
      {subtitle ? (
        <Text style={{ marginTop: 2, fontSize: 15, fontFamily: fonts.body, color: colors.muted }}>
          {subtitle.toLowerCase()}
        </Text>
      ) : null}
    </View>
  );
}
