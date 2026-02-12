// app/(tabs)/profile/rsvps.tsx
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

const RSVP_TABLE = "event_rsvps"; // must match your DB table

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

export default function RsvpsScreen() {
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
      // 1) pull RSVP rows -> event ids
      const { data: rows, error: rErr } = await supabase
        .from(RSVP_TABLE)
        .select("event_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (rErr) {
        console.log("[rsvps] rsvp rows error:", rErr.message);
        setEvents([]);
        return;
      }

      const ids = (rows ?? []).map((r: any) => String(r.event_id)).filter(Boolean);

      if (ids.length === 0) {
        setEvents([]);
        return;
      }

      // 2) fetch those events
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id, title, start_time, location, cover_image")
        .in("id", ids);

      if (evErr) {
        console.log("[rsvps] events error:", evErr.message);
        setEvents([]);
        return;
      }

      // keep the RSVP order (by created_at)
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

  // If not signed in
  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
            sign in to view rsvps.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.headerBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.display }]}>
            rsvpd
          </Text>

          <Pressable
            onPress={load}
            style={[styles.headerBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
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
            <Ionicons name="calendar-outline" size={18} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>
              no rsvps yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
                style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}
              >
                <Image source={{ uri: e.cover_image || initialsAvatar(e.title) }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                    {String(e.title ?? "").toLowerCase()}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                    {formatWhen(e.start_time).toLowerCase()}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
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

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", letterSpacing: 0.6, textTransform: "lowercase" },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  emptyText: { flex: 1, fontWeight: "700", textTransform: "lowercase" },

  card: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#111" },

  title: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  meta: { marginTop: 2, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
});
