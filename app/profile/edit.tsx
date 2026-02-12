// app/profile/edit.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

export default function EditProfileScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const [display_name, setdisplay_name] = useState("");

  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/login" as any);
      return;
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function init() {
    if (!user) return;
    setBusy(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.log("[edit profile fetch error]", error.message);
      // still let them edit locally
      setdisplay_name((user.email?.split("@")[0] ?? "user").toLowerCase());
      setBusy(false);
      return;
    }

    setdisplay_name((data?.display_name ?? user.email?.split("@")[0] ?? "user").toLowerCase());
    setAvatarUrl(data?.avatar_url ?? null);

    setBusy(false);
  }

  const effectiveAvatar = useMemo(() => {
    if (!user) return initialsAvatar("guest");
    if (avatarLocalUri) return avatarLocalUri;
    if (avatarUrl) return avatarUrl;
    return initialsAvatar(display_name || user.email?.split("@")[0] || "user");
  }, [user, avatarLocalUri, avatarUrl, display_name]);

  function cleandisplay_name(s: string) {
    // lowercase, letters/numbers/underscore only
    return s
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("permission needed", "please allow photo access to pick a profile photo.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri ?? null;
    if (!uri) return;

    setAvatarLocalUri(uri);
  }

  function discardPickedAvatar() {
    setAvatarLocalUri(null);
  }

  async function uploadAvatarToStorage(localUri: string): Promise<string> {
    // Supabase Storage bucket: "avatars"
    const fileResp = await fetch(localUri);
    const arrayBuffer = await fileResp.arrayBuffer();

    const ext = (localUri.split(".").pop() || "jpg").toLowerCase();
    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const path = `avatars/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, arrayBuffer, { contentType, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("could not generate public url");
    return data.publicUrl;
  }

  async function save() {
    if (!user) return;

    const uname = cleandisplay_name(display_name.trim());
    if (uname.length < 3) return Alert.alert("display_name too short", "use at least 3 characters.");
    setSaving(true);

    try {
      let finalAvatarUrl = avatarUrl;

      // upload if user picked a new one
      if (avatarLocalUri) {
        finalAvatarUrl = await uploadAvatarToStorage(avatarLocalUri);
      }

      const payload: ProfileRow = {
        id: user.id,
        display_name: uname,
        avatar_url: finalAvatarUrl ?? null,
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

      if (error) {
        console.log("[profiles upsert error]", error.message);
        Alert.alert("save failed", error.message);
        return;
      }

      // keep local state consistent
      setAvatarUrl(finalAvatarUrl ?? null);
      setAvatarLocalUri(null);

      Alert.alert("saved", "your profile was updated.");
      router.back();
    } catch (e: any) {
      console.log("[edit profile save error]", e);
      Alert.alert("error", e?.message ?? "something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          {/* FIX: borderColor variable didn't exist; use border */}
          <Pressable onPress={() => router.back()} style={[styles.headerBtn, { borderColor: border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.display }]}>
            edit profile
          </Text>

          <Pressable
            onPress={save}
            disabled={saving}
            style={[
              styles.saveBtn,
              { backgroundColor: "rgba(73,8,176,0.14)", borderColor: border, opacity: saving ? 0.6 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.saveText, { color: colors.text, fontFamily: fonts.strong }]}>
                save
              </Text>
            )}
          </Pressable>
        </View>

        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ color: colors.muted, fontFamily: fonts.body }}>loading…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Image source={{ uri: effectiveAvatar }} style={styles.avatar} />

              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.muted, fontFamily: fonts.body }]}>
                  profile photo
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable onPress={pickAvatar} style={[styles.btn, { backgroundColor: glass, borderColor: border }]}>
                    <Ionicons name="image-outline" size={18} color={colors.text} />
                    <Text style={[styles.btnText, { color: colors.text, fontFamily: fonts.strong }]}>
                      choose
                    </Text>
                  </Pressable>

                  {avatarLocalUri ? (
                    <Pressable
                      onPress={discardPickedAvatar}
                      style={[
                        styles.btn,
                        { backgroundColor: "rgba(255,77,77,0.10)", borderColor: "rgba(255,77,77,0.22)" },
                      ]}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
                      <Text style={[styles.btnText, { color: "#ff4d4d", fontFamily: fonts.strong }]}>
                        discard
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            <Field label="display_name" colors={colors} fonts={fonts}>
              <TextInput
                value={display_name}
                onChangeText={(t) => setdisplay_name(cleandisplay_name(t))}
                placeholder="display_name"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
                style={[
                  styles.input,
                  { backgroundColor: glass, borderColor: border, color: colors.text, fontFamily: fonts.strong },
                ]}
                autoCapitalize="none"
              />
              <Text style={[styles.hint, { color: colors.muted, fontFamily: fonts.body }]}>
                letters, numbers, underscore. lowercase only.
              </Text>
            </Field>


            <View style={[styles.section, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>
                followed ministries
              </Text>
              <Text style={[styles.sectionSub, { color: colors.muted, fontFamily: fonts.body }]}>
                next step: add a search + follow button here.
              </Text>

              <Pressable
                onPress={() => Alert.alert("later", "we’ll add ministry search + follow here.")}
                style={[styles.btnWide, { backgroundColor: "rgba(73,8,176,0.14)", borderColor: border }]}
              >
                <Text style={[styles.btnWideText, { color: colors.text, fontFamily: fonts.strong }]}>
                  manage followed ministries
                </Text>
              </Pressable>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
  colors,
  fonts,
}: {
  label: string;
  children: React.ReactNode;
  colors: any;
  fonts: any;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.label, { color: colors.muted, fontFamily: fonts.body }]}>
        {label.toLowerCase()}
      </Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "800", textTransform: "lowercase" },
  saveBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontWeight: "800", textTransform: "lowercase" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { paddingHorizontal: 16, paddingBottom: 24 },

  card: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#222" },

  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2, textTransform: "lowercase" },
  hint: { marginTop: 6, fontSize: 12, fontWeight: "600", textTransform: "lowercase" },

  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontWeight: "700",
    textTransform: "lowercase",
  },

  btn: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btnText: { fontWeight: "800", textTransform: "lowercase" },

  section: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", textTransform: "lowercase" },
  sectionSub: { marginTop: 6, fontSize: 12, fontWeight: "600", lineHeight: 16, textTransform: "lowercase" },

  btnWide: {
    marginTop: 12,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  btnWideText: { fontWeight: "800", textTransform: "lowercase" },
});
