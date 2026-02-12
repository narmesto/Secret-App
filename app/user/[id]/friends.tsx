// app/user/[id]/friends.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../context/theme";
import { supabase } from "../../../supabase";

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

function pair(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return { user_low: low, user_high: high };
}

/**
 * Friendships schema detection:
 * A) friendships(user_id, friend_id, status)
 * B) friendships(requester_id, addressee_id, status)
 * C) friendships(user_low, user_high, status)
 */
async function detectFriendshipSchema() {
  const a = await supabase.from("friendships").select("user_id, friend_id").limit(1);
  if (!a.error) return "A" as const;

  const b = await supabase.from("friendships").select("requester_id, addressee_id").limit(1);
  if (!b.error) return "B" as const;

  const c = await supabase.from("friendships").select("user_low, user_high").limit(1);
  if (!c.error) return "C" as const;

  return "A" as const;
}

export default function UserFriendsPage() {
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams();
  const userId = useMemo(() => {
    const raw = (params as any)?.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").trim();
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<ProfileLite[]>([]);
  const [schema, setSchema] = useState<"A" | "B" | "C">("A");

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const s = await detectFriendshipSchema();
      setSchema(s);

      // 1) Fetch friendships involving this user
      let rows: any[] = [];

      if (s === "A") {
        const r = await supabase
          .from("friendships")
          .select("*")
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
          .limit(1000);
        if (r.error) console.log("[user friends A error]", r.error.message);
        rows = r.data ?? [];
      } else if (s === "B") {
        const r = await supabase
          .from("friendships")
          .select("*")
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .limit(1000);
        if (r.error) console.log("[user friends B error]", r.error.message);
        rows = r.data ?? [];
      } else {
        const r = await supabase
          .from("friendships")
          .select("*")
          .or(`user_low.eq.${userId},user_high.eq.${userId}`)
          .limit(1000);
        if (r.error) console.log("[user friends C error]", r.error.message);
        rows = r.data ?? [];
      }

      // 2) Keep accepted-ish
      const accepted = rows.filter((r) => {
        const st = (r?.status ?? "").toString().toLowerCase().trim();
        if (!st) return true; // some schemas have no status
        return st === "accepted" || st === "friends" || st === "active";
      });

      // 3) Extract friend ids
      const ids = new Set<string>();
      for (const r of accepted) {
        if (s === "A") {
          const a = String(r.user_id ?? "");
          const b = String(r.friend_id ?? "");
          const other = a === userId ? b : a;
          if (other) ids.add(other);
        } else if (s === "B") {
          const a = String(r.requester_id ?? "");
          const b = String(r.addressee_id ?? "");
          const other = a === userId ? b : a;
          if (other) ids.add(other);
        } else {
          const a = String(r.user_low ?? "");
          const b = String(r.user_high ?? "");
          const other = a === userId ? b : a;
          if (other) ids.add(other);
        }
      }

      const friendIds = Array.from(ids);
      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      // 4) Fetch profiles
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", friendIds);

      if (pErr) {
        console.log("[user friends profiles error]", pErr.message);
        setFriends([]);
        return;
      }

      const cleaned: ProfileLite[] = (profs ?? []).map((p: any) => ({
        id: String(p.id),
        display_name: p.display_name ?? null,
        avatar_url: p.avatar_url ?? null,
      }));

      // stable order by display name
      cleaned.sort((x, y) => {
        const a = (x.display_name ?? "user").toLowerCase();
        const b = (y.display_name ?? "user").toLowerCase();
        return a.localeCompare(b);
      });

      setFriends(cleaned);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!userId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>missing user id.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* mini header */}
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
            {friends.map((f) => {
              const name = (f.display_name ?? "user").toLowerCase();
              const av = f.avatar_url || initialsAvatar(name);

              return (
                <Pressable
                  key={`friend-${f.id}`}
                  onPress={() => router.push({ pathname: "/user/[id]" as any, params: { id: f.id } })}
                  style={[styles.row, { backgroundColor: colors.card2, borderColor: colors.border }]}
                >
                  <Image source={{ uri: av }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.rowMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                      tap to view profile
                    </Text>
                  </View>

                  <Pressable
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      router.push({ pathname: "/social/dm/[peerId]" as any, params: { peerId: f.id } });
                    }}
                    style={[styles.msgBtn, { borderColor: colors.border, backgroundColor: "rgba(73,8,176,0.12)" }]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                  </Pressable>

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

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 22 },
  muted: { marginTop: 8, fontWeight: "700", textTransform: "lowercase" },

  miniHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  miniHeaderTitle: { fontSize: 18, fontWeight: "700", letterSpacing: 0.6, textTransform: "lowercase" },
  miniHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { fontWeight: "600", flex: 1, lineHeight: 18, textTransform: "lowercase" },

  row: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#111" },
  rowTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  rowMeta: { marginTop: 3, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  msgBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
