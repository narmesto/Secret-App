// app/check-email.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/theme";

export default function CheckEmailScreen() {
  const { colors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  const params = useLocalSearchParams();
  const email = useMemo(() => {
    const raw = (params as any)?.email;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return String(val ?? "").trim().toLowerCase();
  }, [params]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  async function openMail() {
    try {
      // iOS/Android will handle what it can; worst case it fails silently.
      await Linking.openURL("mailto:");
    } catch {
      Alert.alert("couldn't open mail", "please open your email app and look for the confirmation email.");
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: glass, borderColor: border }]}>
            <Ionicons name="mail-outline" size={22} color={colors.text} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>check your email</Text>

          <Text style={[styles.sub, { color: colors.muted }]}>
            {email
              ? `we sent a confirmation link to ${email}.`
              : "we sent a confirmation link to your email."}
          </Text>

          <Text style={[styles.sub2, { color: colors.muted }]}>
            open it, tap confirm, then come back here and sign in.
          </Text>

          <Pressable
            onPress={openMail}
            style={[styles.primary, { backgroundColor: "rgba(73,8,176,0.16)", borderColor: border }]}
          >
            <Text style={[styles.primaryText, { color: colors.text }]}>open mail</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/login" as any)}
            style={[styles.secondary, { backgroundColor: glass, borderColor: border }]}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>back to login</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/login" as any)} style={{ marginTop: 10 }}>
            <Text style={[styles.link, { color: colors.muted }]}>
              already confirmed? tap here to sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, padding: 18, justifyContent: "center" },

  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { marginTop: 12, fontSize: 18, fontWeight: "900", textTransform: "lowercase" },
  sub: { marginTop: 8, fontSize: 13, fontWeight: "800", textAlign: "center", textTransform: "lowercase" },
  sub2: { marginTop: 6, fontSize: 12, fontWeight: "700", textAlign: "center", textTransform: "lowercase" },

  primary: {
    marginTop: 16,
    height: 46,
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontWeight: "900", textTransform: "lowercase" },

  secondary: {
    marginTop: 10,
    height: 46,
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontWeight: "900", textTransform: "lowercase" },

  link: { fontWeight: "800", textTransform: "lowercase" },
});
