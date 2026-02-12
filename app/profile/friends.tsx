// app/profile/friends.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
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

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

async function fetchFriendIds(myId: string): Promise<string[]> {
  // ✅ Pattern A: friend_requests(from_user,to_user,status='accepted')
  {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("from_user, to_user, status")
      .or(`from_user.eq.${myId},to_user.eq.${myId}`)
      .eq("status", "accepted");

    if (!error) {
      const ids = (data ?? [])
        .map((r: any) => (String(r.from_user) === myId ? String(r.to_user) : String(r.from_user)))
        .filter(Boolean);
      return Array.from(new Set(ids));
    }

    // if table doesn't exist, ignore; otherwise log
    const msg = String(error.message || "").toLowerCase();
    const missing =
      msg.includes("schema cache") || msg.includes("could not find the table") || msg.includes("does not exist");
    if (!missing) console.log("[friends] friend_requests error:", error.message);
  }

  // ✅ Pattern B: friends/friendships(user_low,user_high,status='accepted')
  const tables = ["friends", "friendships"];
  for (const t of tables) {
    const { data, error } = await supabase
      .from(t)
      .select("user_low, user_high, status")
      .or(`user_low.eq.${myId},user_high.eq.${myId}`)
      .eq("status", "accepted");

    if (!error) {
      const ids = (data ?? [])
        .map((r: any) => (String(r.user_low) === myId ? String(r.user_high) : String(r.user_low)))
        .filter(Boolean);
      return Array.from(new Set(ids));
    }

    const msg = String(error.message || "").toLowerCase();
    const missing =
      msg.includes("schema cache") || msg.includes("could not find the table") || msg.includes("does not exist");
    if (!missing) {
      console.log(`[friends] ${t} error:`, error.message);
      break;
    }
  }

  return [];
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<ProfileLite[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setFriends([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const friendIds = await fetchFriendIds(user.id);

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", friendIds);

      if (error) {
        console.log("[friends] profiles error:", error.message);
        setFriends([]);
        return;
      }

      // keep order stable
      const byId = new Map((data ?? []).map((p: any) => [String(p.id), p]));
      const ordered = friendIds.map((id) => byId.get(id)).filter(Boolean) as ProfileLite[];
      setFriends(ordered);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
            sign in to view friends.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.miniHeader}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.miniHeaderBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>

          <Text style={[styles.miniHeaderTitle, { color: colors.text, fontFamily: fonts.display }]}>
            friends
          </Text>

          <Pressable
            onPress={load}
            style={[styles.miniHeaderBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
          >
            <Ionicons name="refresh" size={16} color={isDark ? "#fff" : colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>loading…</Text>
          </View>
        ) : friends.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={18} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>
              no friends yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {friends.map((p) => {
              const name = (p.display_name ?? "user").toLowerCase();
              const avatar = p.avatar_url || initialsAvatar(name);
              return (
                <Pressable
                  key={`friend-${p.id}`}
                  onPress={() => router.push(`/user/${String(p.id).trim()}` as any)}
                  style={[styles.row, { backgroundColor: colors.card2, borderColor: colors.border }]}
                >
                  <Image source={{ uri: avatar }} style={styles.thumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.rowMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                      tap to view profile
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  center: { paddingTop: 24, alignItems: "center", justifyContent: "center" },
  muted: { opacity: 0.75, fontWeight: "700", textTransform: "lowercase" },

  miniHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  miniHeaderTitle: { fontSize: 18, fontWeight: "700", letterSpacing: 0.6, textTransform: "lowercase" },
  miniHeaderBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  empty: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  emptyText: { flex: 1, fontWeight: "700", textTransform: "lowercase" },

  row: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#111" },
  rowTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  rowMeta: { marginTop: 2, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
});
