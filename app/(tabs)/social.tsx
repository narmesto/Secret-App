import { Stack } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";
import { useTheme } from "../../context/theme";

export default function SocialScreen() {
  const { colors, fonts } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerTitle: "Social" }} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.text }}>
          Coming Soon
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 16, color: colors.muted, marginTop: 8 }}>
          Social features are under construction.
        </Text>
      </View>
    </SafeAreaView>
  );
}
