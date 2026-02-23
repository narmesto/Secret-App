// app/(tabs)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { EventImageCard } from "../../components/home/EventImageCard";
import { SectionHeader } from "../../components/home/SectionHeader";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { EventRow } from "../../types";
import { supabase } from "../../supabase";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

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

async function selectFirstWorking<T = any>(
  tables: string[],
  build: (table: string) => any,
  label: string
): Promise<{ table: string | null; data: T[] }> {
  for (const t of tables) {
    const { data, error } = await build(t);

    if (!error) return { table: t, data: (data ?? []) as T[] };

    const msg = String(error.message || "").toLowerCase();
    const schemaMissing =
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      msg.includes("does not exist");

    if (!schemaMissing) {
      console.log(`[${label}] query error on ${t}:`, error.message);
      return { table: t, data: [] };
    }
  }
  return { table: null, data: [] };
}

// ✅ same idea, but returns a working table + exact count (no rows)
async function countFirstWorking(
  tables: string[],
  build: (table: string) => Promise<{ count: number | null; error: any }>,
  label: string
): Promise<{ table: string | null; count: number }> {
  for (const t of tables) {
    const { count, error } = await build(t);

    if (!error) return { table: t, count: count ?? 0 };

    const msg = String(error.message || "").toLowerCase();
    const schemaMissing =
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      msg.includes("does not exist");

    if (!schemaMissing) {
      console.log(`[${label}] query error on ${t}:`, error.message);
      return { table: t, count: 0 };
    }
  }
  return { table: null, count: 0 };
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors, resolvedScheme, fonts, mode, setMode } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [friendsCount, setFriendsCount] = useState(0); // ✅ NEW
  const [saved, setSaved] = useState<MiniEvent[]>([]);
  const [rsvps, setRsvps] = useState<MiniEvent[]>([]);
  const [myEvents, setMyEvents] = useState<EventRow[]>([]);

  const displayName = useMemo(() => {
    const u = profile?.display_name?.trim();
    if (u) return u.toLowerCase();
    const fallback = user?.email?.split("@")[0] ?? "user";
    return fallback.toLowerCase();
  }, [profile?.display_name, user?.email]);

  const avatarUri = useMemo(() => {
    if (profile?.avatar_url) return profile.avatar_url;
    return initialsAvatar(displayName || "user");
  }, [profile?.avatar_url, displayName]);

  const switchTrack = isDark
    ? { false: "rgba(255,255,255,0.22)", true: "rgba(255,255,255,0.55)" }
    : { false: "rgba(0,0,0,0.1)", true: "rgba(0,0,0,0.42)" };

  const switchThumb = isDark ? "#fff" : "rgba(17,17,24,0.92)";

  // ✅ NEW: count accepted friends across likely schemas
  const fetchFriendsCount = useCallback(async () => {
    if (!user?.id) {
      setFriendsCount(0);
      return;
    }

    const uid = user.id;

    // Try a few likely friend table names
    const friendTables = ["friendships", "friends", "user_friends", "friend_requests", "friend_request"];

    const result = await countFirstWorking(
      friendTables,
      async (t) => {
        // 1) friendships: user_low/user_high + status=accepted
        // 2) friend_requests: from_user/to_user + status=accepted
        // 3) friends/user_friends: user_id/friend_id (may be already accepted by definition)
        // We'll attempt queries in descending likelihood.

        // Attempt A: user_low/user_high
        {
          const { count, error } = await supabase
            .from(t)
            .select("id", { count: "exact", head: true })
            .eq("status", "accepted")
            .or(`user_low.eq.${uid},user_high.eq.${uid}`);

          if (!error) return { count, error: null };
        }

        // Attempt B: from_user/to_user
        {
          const { count, error } = await supabase
            .from(t)
            .select("id", { count: "exact", head: true })
            .eq("status", "accepted")
            .or(`from_user.eq.${uid},to_user.eq.${uid}`);

          if (!error) return { count, error: null };
        }

        // Attempt C: user_id/friend_id (no status)
        {
          const { count, error } = await supabase
            .from(t)
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid);

          if (!error) return { count, error: null };
        }

        // Attempt D: two-way rows (either side)
        {
          const { count, error } = await supabase
            .from(t)
            .select("id", { count: "exact", head: true })
            .or(`user_id.eq.${uid},friend_id.eq.${uid}`);

          return { count, error };
        }
      },
      "profile friends"
    );

    // NOTE: if your friends table stores BOTH directions (A->B and B->A),
    // the count will be doubled. If that happens, tell me your table name/columns
    // and I’ll dedupe properly.
    setFriendsCount(result.count);
  }, [user?.id]);

  const loadEverything = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setFriendsCount(0);
      setSaved([]);
      setRsvps([]);
      setMyEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // profile
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        console.log("[profile fetch error]", pErr.message);
        setProfile(null);
      } else {
        setProfile((p ?? null) as any);
      }

      // ✅ friends count
      await fetchFriendsCount();

      // saved + rsvp
      const savedTables = ["event_saves", "event_save", "saved_events", "event_saved"];
      const rsvpTables = ["event_rsvps", "event_rsvp", "rsvps", "event_rsvp_users"];

      const { table: savedTable, data: savedRows } = await selectFirstWorking<{ event_id: any }>(
        savedTables,
        (t) =>
          supabase
            .from(t)
            .select("event_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        "profile saved"
      );

      const { table: rsvpTable, data: rsvpRows } = await selectFirstWorking<{ event_id: any }>(
        rsvpTables,
        (t) =>
          supabase
            .from(t)
            .select("event_id, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        "profile rsvp"
      );

      const savedIds = (savedRows ?? []).map((r: any) => String(r.event_id)).filter(Boolean);
      const rsvpIds = (rsvpRows ?? []).map((r: any) => String(r.event_id)).filter(Boolean);

      async function fetchEventsByIds(ids: string[]): Promise<MiniEvent[]> {
        if (ids.length === 0) return [];
        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("id, title, start_time, location, cover_image")
          .in("id", ids);

        if (evErr) {
          console.log("[profile events fetch error]", evErr.message);
          return [];
        }

        const byId = new Map((ev ?? []).map((e: any) => [String(e.id), e]));
        return ids.map((id) => byId.get(String(id))).filter(Boolean) as MiniEvent[];
      }

      async function fetchMyEvents(ownerId: string): Promise<EventRow[]> {
        const { data, error } = await supabase
          .from("events")
          .select(`
            id,
            title,
            description,
            location,
            start_time,
            cover_image,
            lat,
            lng,
            owner_id,
            ministry_id,
            event_categories ( categories ( id, name ) ),
            ministries (id, name)
          `)
          .eq("owner_id", ownerId)
          .order("start_time", { ascending: false });

        if (error) {
          console.log("[profile my events fetch error]", error.message);
          return [];
        }
        const transformed = (data ?? []).map((d) => ({
          ...d,
          categories: d.event_categories.map((ec: any) => ec.categories.name),
          ministries: d.ministries?.[0] ?? null,
        }));
        return transformed as unknown as EventRow[];
      }

      const [savedEvents, rsvpEvents, myEventsData] = await Promise.all([
        fetchEventsByIds(savedIds),
        fetchEventsByIds(rsvpIds),
        fetchMyEvents(user.id),
      ]);

      setSaved(savedEvents);
      setRsvps(rsvpEvents);
      setMyEvents(myEventsData);

      if (!savedTable) console.log("[profile] could not find a working saved table name");
      if (!rsvpTable) console.log("[profile] could not find a working rsvp table name");
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchFriendsCount]);

  const navigation = useNavigation();

    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable onPress={() => router.push('/notifications')} style={{ marginRight: 12 }}>
                    <Ionicons name="notifications-outline" size={24} color={colors.text} />
                </Pressable>
            ),
        });
    }, [navigation, colors]);

    useFocusEffect(
        useCallback(() => {
            loadEverything();
        }, [loadEverything])
    );

  async function onSignOut() {
    try {
      await signOut();
      router.replace("/login" as any);
    } catch (e: any) {
      Alert.alert("sign out failed", e?.message ?? "something went wrong");
    }
  }

  function goEdit() {
    if (!user) return router.replace("/login" as any);
    router.push("/profile/edit" as any);
  }

  function openFriends() {
    router.push("/profile/friends" as any);
  }

  function openSaved() {
    router.push("/profile/saved" as any);
  }

  function openRsvps() {
    router.push("/profile/rsvps" as any);
  }

  function openMinistries() {
    Alert.alert("ministries", "we’ll wire followed ministries soon.");
  }

  function toggleAppearance() {
    setMode(isDark ? "light" : "dark");
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.display }]}>profile</Text>
          <Text style={[styles.sub, { color: colors.muted, fontFamily: fonts.body }]}>
            sign in to edit your profile, save events, and add friends.
          </Text>

          <Pressable
            onPress={() => router.replace("/login" as any)}
            style={[styles.primaryBtn, { backgroundColor: colors.card, borderColor: softBorder }]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.text, fontFamily: fonts.strong }]}>
              go to login
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          <Image source={{ uri: avatarUri }} style={styles.avatar} />

          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.meta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
              {(user.email ?? "").toLowerCase()}
            </Text>
          </View>

          <Pressable onPress={goEdit} style={[styles.editBtn, { backgroundColor: glass, borderColor: softBorder }]}>
            <Ionicons name="create-outline" size={18} color={colors.text} />
            <Text style={[styles.editText, { color: colors.text, fontFamily: fonts.strong }]}>edit</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          {/* ✅ friends count now real */}
          <MiniStatPressable
            label="friends"
            value={String(friendsCount)}
            onPress={openFriends}
            colors={colors}
            fonts={fonts}
          />
          <MiniStatPressable label="saved" value={String(saved.length)} onPress={openSaved} colors={colors} fonts={fonts} />
          <MiniStatPressable label="rsvpd" value={String(rsvps.length)} onPress={openRsvps} colors={colors} fonts={fonts} />
        </View>

        {myEvents.length > 0 ? (
          <View>
            <SectionHeader title="My Events" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 12, marginHorizontal: -16 }}
              contentContainerStyle={{ paddingHorizontal: 16 }}
            >
              {myEvents.map((e) => (
                <EventImageCard
                  key={`my-event-${e.id}`}
                  variant="small"
                  event={e}
                  onPress={() => router.push(`/event/${e.id}`)}
                  // These props are not needed here, but the component expects them
                  saved={false}
                  saving={false}
                  onToggleSave={() => {}}
                  friendSaveCount={0}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Pressable
          onPress={openMinistries}
          style={[styles.singleCard, { backgroundColor: colors.card2, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { borderColor: colors.border }]}>
            <Ionicons name="compass-outline" size={16} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.singleTitle, { color: colors.text, fontFamily: fonts.display }]}>ministries</Text>
            <Text style={[styles.singleSub, { color: colors.muted, fontFamily: fonts.body }]}>
              followed ministries (coming soon)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>

        <View style={[styles.settingsCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          <Text style={[styles.settingsTitle, { color: colors.text, fontFamily: fonts.display }]}>settings</Text>

          <View style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={[styles.rowIcon, { borderColor: colors.border }]}>
              <Ionicons name="moon-outline" size={16} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.body }]}>dark mode</Text>
            </View>

            <Switch
              value={mode === "dark"}
              onValueChange={toggleAppearance}
              trackColor={switchTrack}
              thumbColor={switchThumb}
            />
          </View>

          <Row
            label="preferences"
            icon="options-outline"
            onPress={() => Alert.alert("later", "we can wire preferences here.")}
            colors={colors}
            fonts={fonts}
          />
          <Row
            label="privacy"
            icon="lock-closed-outline"
            onPress={() => Alert.alert("later", "we can wire privacy here.")}
            colors={colors}
            fonts={fonts}
          />
          <Row
            label="help"
            icon="help-circle-outline"
            onPress={() => Alert.alert("later", "we can wire help here.")}
            colors={colors}
            fonts={fonts}
          />
        </View>

        <Pressable onPress={onSignOut} style={[styles.signOutBtn, { borderColor: "rgba(255,77,77,0.35)" }]}>
          <Ionicons name="log-out-outline" size={18} color="#ff4d4d" />
          <Text style={[styles.signOutText, { color: "#ff4d4d", fontFamily: fonts.strong }]}>sign out</Text>
        </Pressable>

        {loading ? (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 6, color: colors.muted, fontFamily: fonts.body }}>loading…</Text>
          </View>
        ) : null}

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- components ---------- */

function MiniStatPressable({
  label,
  value,
  onPress,
  colors,
  fonts,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: any;
  fonts: any;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.stat, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text, fontFamily: fonts.display }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted, fontFamily: fonts.body }]}>{label}</Text>
    </Pressable>
  );
}

function Row({
  label,
  icon,
  onPress,
  colors,
  fonts,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  colors: any;
  fonts: any;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={[styles.rowIcon, { borderColor: colors.border }]}>
        <Ionicons name={icon} size={16} color={colors.text} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.body }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  title: { fontSize: 18, fontWeight: "800", textTransform: "lowercase" },
  sub: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textTransform: "lowercase",
    textAlign: "center",
  },

  primaryBtn: {
    marginTop: 14,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontWeight: "800", textTransform: "lowercase" },

  miniHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
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

  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#222" },
  name: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },
  meta: { marginTop: 4, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  editBtn: {
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editText: { fontWeight: "800", textTransform: "lowercase" },

  statsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },
  statLabel: { marginTop: 4, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  singleCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  singleTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  singleSub: { marginTop: 3, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  settingsCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsTitle: { padding: 14, fontSize: 14, fontWeight: "900", textTransform: "lowercase" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 13, fontWeight: "700", textTransform: "lowercase" },

  signOutBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,77,77,0.06)",
  },
  signOutText: { fontWeight: "900", textTransform: "lowercase" },
});
