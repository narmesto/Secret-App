import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../context/theme";

export function LoadingBubble() {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubble, { backgroundColor: colors.card }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function EmptyBubble({ text }: { text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    marginHorizontal: 24,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 100,
  },
});
