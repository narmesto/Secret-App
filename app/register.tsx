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
import * as Linking from "expo-linking";
import { useTheme } from "../context/theme";
import { supabase } from "../supabase";

export default function Register() {
  const { colors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [denomination, setDenomination] = useState("");
  const [busy, setBusy] = useState(false);

  function cleanEmail() {
    return email.trim().toLowerCase();
  }

  async function signUp() {
    const e = cleanEmail();
    if (!e.includes("@")) return Alert.alert("Enter a valid email");
    if (password.length < 6) return Alert.alert("Password must be at least 6 characters");
    if (password !== confirmPassword) return Alert.alert("Passwords do not match");
    if (!fullName.trim()) return Alert.alert("Enter your full name");
    if (!phone.trim()) return Alert.alert("Enter your phone number");
    if (!age.trim()) return Alert.alert("Enter your age");
    if (!gender.trim()) return Alert.alert("Enter your gender");

    setBusy(true);
    try {
      // Create a URL that will redirect back to the app
      const redirectUrl = Linking.createURL("login");
      console.log("Redirect URL:", redirectUrl); // Helpful for debugging

      const { data, error } = await supabase.auth.signUp({
        email: e,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            phone: phone,
            age: parseInt(age) || null,
            gender: gender,
            denomination: denomination,
          },
        },
      });

      if (error) return Alert.alert("Sign up failed", error.message);

      // If confirmations are enabled, session will be null until confirmed
      if (!data.session) {
        router.replace(`/check-email?email=${encodeURIComponent(e)}` as any);
        return;
      }

      // If confirmations are disabled, user is signed in immediately
      router.replace("/(tabs)/home" as any);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Join us to post, save, and message.</Text>

        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full Name"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
        />

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
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone Number"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          keyboardType="phone-pad"
        />

        <View style={styles.row}>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="Age"
            placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
            style={[styles.input, styles.half, { backgroundColor: glass, borderColor: border, color: colors.text }]}
            keyboardType="number-pad"
          />
          <TextInput
            value={gender}
            onChangeText={setGender}
            placeholder="Gender"
            placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
            style={[styles.input, styles.half, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          />
        </View>

        <TextInput
          value={denomination}
          onChangeText={setDenomination}
          placeholder="Denomination (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          secureTextEntry
        />

        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm Password"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
          style={[styles.input, { backgroundColor: glass, borderColor: border, color: colors.text }]}
          secureTextEntry
        />

        <Pressable
          onPress={signUp}
          disabled={busy}
          style={[
            styles.btn,
            { backgroundColor: "rgba(251,113,133,0.92)", opacity: busy ? 0.6 : 1 },
          ]}
        >
          {busy ? <ActivityIndicator /> : <Text style={styles.btnText}>Sign Up</Text>}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={busy}
          style={[styles.btnAlt, { borderColor: border, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={[styles.btnAltText, { color: colors.text }]}>Back to Login</Text>
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
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  btn: { height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 6 },
  btnText: { color: "#fff", fontWeight: "900" },
  btnAlt: { height: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  btnAltText: { fontWeight: "900" },
});
