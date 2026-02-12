// app/social/inbox.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

type FriendshipRow = {
  id: string;
  user_low: string;
  user_high: string;
  requested_by: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export default function InboxScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";
  const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requested_by, status, created_at")
      .order("created_at", { ascending: false });

    if (error) console.log("[inbox friendships]", error.message);

    setFriendships((data ?? []) as any);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const incoming = useMemo(() => {
    if (!user?.id) return [];
    return friendships.filter((fr) => {
      if (fr.status !== "pending") return false;
      const meInPair = fr.user_low === user.id || fr.user_high === user.id;
      const fromOther = fr.requested_by !== user.id;
      return meInPair && fromOther;
    });
  }, [friendships, user?.id]);

  async function accept(fr: FriendshipRow) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", fr.id);

    if (error) return Alert.alert("accept failed", error.message);
    load();
  }

  async function decline(fr: FriendshipRow) {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "declined" })
      .eq("id", fr.id);

    if (error) return Alert.alert("decline failed", error.message);
    load();
  }

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.center}>
          <Text style={{ color: colors.text, fontFamily: fonts.display }}>inbox</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.body, marginTop: 8 }}>
            sign in to view requests.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card2 }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.display }]}>inbox</Text>

          <Pressable
            onPress={load}
            style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card2 }]}
          >
            <Ionicons name="refresh" size={16} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          {loading ? (
            <View style={styles.padRow}>
              <ActivityIndicator />
              <Text style={{ color: colors.muted, fontFamily: fonts.body }}>loading…</Text>
            </View>
          ) : incoming.length === 0 ? (
            <View style={styles.padRow}>
              <Ionicons name="mail-open-outline" size={18} color={colors.muted} />
              <Text style={{ color: colors.muted, fontFamily: fonts.body }}>
                no friend requests right now.
              </Text>
            </View>
          ) : (
            incoming.map((fr, idx) => {
              const otherId = fr.user_low === user.id ? fr.user_high : fr.user_low;

              return (
                <View
                  key={fr.id}
                  style={[
                    styles.row,
                    { borderTopColor: colors.border },
                    idx === 0 ? { borderTopWidth: 0 } : null,
                  ]}
                >
                  <View style={[styles.rowIcon, { borderColor: colors.border }]}>
                    <Ionicons name="person-outline" size={16} color={colors.text} />
                  </View>

                  <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.body }]} numberOfLines={1}>
                    request from {otherId.slice(0, 8)}…
                  </Text>

                  <View style={{ flex: 1 }} />

                  <Pressable
                    onPress={() => decline(fr)}
                    style={[
                      styles.declineBtn,
                      { borderColor: "rgba(255,77,77,0.28)", backgroundColor: "rgba(255,77,77,0.06)" },
                    ]}
                  >
                    <Text style={{ color: "#ff4d4d", fontFamily: fonts.strong, fontWeight: "900" }}>
                      decline
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => accept(fr)}
                    style={[styles.acceptBtn, { backgroundColor: "rgba(73,8,176,0.14)", borderColor: softBorder }]}
                  >
                    <Text style={{ color: colors.text, fontFamily: fonts.strong, fontWeight: "900" }}>
                      accept
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: "800", textTransform: "lowercase" },
  headerBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  padRow: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14 },

  row: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
  rowIcon: { width: 30, height: 30, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 13, fontWeight: "800", textTransform: "lowercase" },

  acceptBtn: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  declineBtn: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
