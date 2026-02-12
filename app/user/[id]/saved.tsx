// app/user/[id]/saved.tsx
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

export default function UserSavedEventsPage() {
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
  const [events, setEvents] = useState<MiniEvent[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // 1) saved rows (order newest-first)
      const { data: rows, error: rErr } = await supabase
        .from("event_saves")
        .select("event_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (rErr) {
        console.log("[user saved rows error]", rErr.message);
        setEvents([]);
        return;
      }

      const ids = (rows ?? []).map((r: any) => String(r.event_id)).filter(Boolean);
      if (!ids.length) {
        setEvents([]);
        return;
      }

      // 2) fetch events
      const { data: ev, error: eErr } = await supabase
        .from("events")
        .select("id, title, start_time, location, cover_image")
        .in("id", ids);

      if (eErr) {
        console.log("[user saved events error]", eErr.message);
        setEvents([]);
        return;
      }

      const byId = new Map((ev ?? []).map((e: any) => [String(e.id), e]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

      const cleaned: MiniEvent[] = ordered.map((e: any) => ({
        id: String(e.id),
        title: String(e.title ?? ""),
        start_time: String(e.start_time),
        location: e.location ?? null,
        cover_image: e.cover_image ?? null,
      }));

      setEvents(cleaned);
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
            saved
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
  thumb: { width: 62, height: 62, borderRadius: 16, backgroundColor: "#111" },
  rowTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  rowMeta: { marginTop: 3, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
});
