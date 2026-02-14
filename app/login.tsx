// app/login.tsx
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../context/theme";
import { supabase } from "../supabase";

export default function Login() {
  const { colors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function cleanEmail() {
    return email.trim().toLowerCase();
  }

  async function signIn() {
    const e = cleanEmail();
    if (!e.includes("@")) return Alert.alert("Enter a valid email");
    if (password.length < 6) return Alert.alert("Password must be at least 6 characters");

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password,
      });

      if (error) return Alert.alert("Sign in failed", error.message);

      if (data.session) {
        router.replace("/(tabs)/home" as any);
      } else {
        // Shouldn't happen for email+password, but safe fallback
        router.replace("/(tabs)/home" as any);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.text }]}>GATHER</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Sign in to post, save, and message.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          secureTextEntry
        />

        <Pressable
          onPress={signIn}
          disabled={busy}
          style={[
            styles.btn,
            { backgroundColor: "rgba(251,113,133,0.92)", opacity: busy ? 0.6 : 1 },
          ]}
        >
          {busy ? <ActivityIndicator /> : <Text style={styles.btnText}>Sign In</Text>}
        </Pressable>

        <Pressable
          onPress={() => router.push("/register" as any)}
          disabled={busy}
          style={[styles.btnAlt, { borderColor: border, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Text style={[styles.btnAltText, { color: colors.text }]}>Create account</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  title: { fontFamily: "Baron", fontSize: 28, letterSpacing: 2, marginTop: 10 },
  sub: { fontWeight: "800", marginBottom: 10 },
  input: { height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontWeight: "800" },
  btn: { height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 6 },
  btnText: { color: "#fff", fontWeight: "900" },
  btnAlt: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  btnAltText: { fontWeight: "900" },
});
