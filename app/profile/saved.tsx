// app/profile/saved.tsx
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

type MiniEvent = {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
  cover_image: string | null;
};

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// tries a few likely names so it won’t crash if your table differs
async function selectFirstWorking<T = any>(
  tables: string[],
  build: (t: string) => any
): Promise<{ table: string | null; data: T[] }> {
  for (const t of tables) {
    const { data, error } = await build(t);
    if (!error) return { table: t, data: (data ?? []) as T[] };

    const msg = String(error.message || "").toLowerCase();
    const schemaMissing =
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      msg.includes("does not exist");

    if (!schemaMissing) return { table: null, data: [] };
  }
  return { table: null, data: [] };
}

export default function SavedEventsScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<MiniEvent[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const savedTables = ["event_saves", "event_save", "saved_events", "event_saved"];
      const { data: rows } = await selectFirstWorking<{ event_id: any }>(savedTables, (t) =>
        supabase.from(t).select("event_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false })
      );

      const ids = (rows ?? []).map((r: any) => String(r.event_id)).filter(Boolean);

      if (ids.length === 0) {
        setEvents([]);
        return;
      }

      const { data: ev, error } = await supabase
        .from("events")
        .select("id, title, start_time, location, cover_image")
        .in("id", ids);

      if (error) {
        console.log("[saved events fetch error]", error.message);
        setEvents([]);
        return;
      }

      const byId = new Map((ev ?? []).map((e: any) => [String(e.id), e]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MiniEvent[];
      setEvents(ordered);
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
            sign in to view saved events.
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

          <Text style={[styles.miniHeaderTitle, { color: colors.text, fontFamily: fonts.display }]}>saved</Text>

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
        ) : events.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Ionicons name="bookmark-outline" size={18} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>
              no saved events yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {events.map((e) => (
              <Pressable
                key={`saved-${e.id}`}
                onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
                style={[styles.row, { backgroundColor: colors.card2, borderColor: colors.border }]}
              >
                <Image source={{ uri: e.cover_image || initialsAvatar(e.title) }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                    {String(e.title ?? "").toLowerCase()}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                    {formatWhen(e.start_time).toLowerCase()}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                    {(e.location ?? "location tbd").toLowerCase()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
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
