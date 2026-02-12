// app/ministry/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../context/auth";
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

// Try both common ministry_follows schemas:
// A) (user_id, ministry_id)
// B) (follower_id, ministry_id)
async function detectFollowsSchema(userId: string, ministryId: string) {
  // returns which column is used for user: "user_id" | "follower_id"
  // We detect by trying a harmless SELECT.
  const tryUserId = await supabase
    .from("ministry_follows")
    .select("ministry_id")
    .eq("ministry_id", ministryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!tryUserId.error) return "user_id";

  const tryFollowerId = await supabase
    .from("ministry_follows")
    .select("ministry_id")
    .eq("ministry_id", ministryId)
    .eq("follower_id", userId)
    .maybeSingle();

  if (!tryFollowerId.error) return "follower_id";

  // If both errored, default to user_id but we’ll show the error later on actual actions.
  return "user_id";
}

export default function MinistryProfile() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams();
  const ministryId = useMemo(() => {
    const raw = (params as any)?.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").trim();
  }, [params]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [ministry, setMinistry] = useState<any | null>(null);

  const [events, setEvents] = useState<MiniEvent[]>([]);

  const [followBusy, setFollowBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState<number>(0);

  const [followsUserCol, setFollowsUserCol] = useState<"user_id" | "follower_id">("user_id");

  const name = useMemo(() => {
    const n =
      ministry?.name ??
      ministry?.display_name ??
      ministry?.title ??
      ministry?.ministry_name ??
      "ministry";
    return String(n).toLowerCase();
  }, [ministry]);

  const avatarUri = useMemo(() => {
    const uri = ministry?.avatar_url ?? ministry?.logo_url ?? ministry?.image_url ?? null;
    return uri ? String(uri) : initialsAvatar(name || "ministry");
  }, [ministry, name]);

  const coverUri = useMemo(() => {
    const uri = ministry?.cover_image ?? ministry?.cover_url ?? ministry?.banner_url ?? null;
    return uri ? String(uri) : null;
  }, [ministry]);

  const subtitle = useMemo(() => {
    const city = ministry?.city ?? ministry?.location ?? null;
    const denom = ministry?.denomination ?? null;
    const pieces = [city, denom].filter(Boolean).map((x: any) => String(x).toLowerCase());
    return pieces.join(" • ");
  }, [ministry]);

  const bio = useMemo(() => {
    const b = ministry?.bio ?? ministry?.description ?? ministry?.about ?? null;
    return b ? String(b).toLowerCase() : null;
  }, [ministry]);

  const load = useCallback(async () => {
    if (!ministryId) return;

    setLoading(true);
    try {
      // Grab the ministry row (select * to avoid column mismatch)
      const { data: m, error: mErr } = await supabase
        .from("ministries")
        .select("*")
        .eq("id", ministryId)
        .maybeSingle();

      if (mErr) {
        console.log("[ministry fetch error]", mErr.message);
        setMinistry(null);
      } else {
        setMinistry(m ?? null);
      }

      // Events for this ministry (requires events.ministry_id)
      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id, title, start_time, location, cover_image")
        .eq("ministry_id", ministryId)
        .order("start_time", { ascending: true });

      if (evErr) {
        console.log("[ministry events error]", evErr.message);
        setEvents([]);
      } else {
        setEvents((ev ?? []).map((e: any) => ({
          id: String(e.id),
          title: String(e.title ?? ""),
          start_time: String(e.start_time),
          location: e.location ?? null,
          cover_image: e.cover_image ?? null,
        })));
      }

      // followers count
      // Use head:true count exact to avoid pulling rows
      const countRes = await supabase
        .from("ministry_follows")
        .select("ministry_id", { count: "exact", head: true })
        .eq("ministry_id", ministryId);

      if (countRes.error) {
        console.log("[followers count error]", countRes.error.message);
        setFollowersCount(0);
      } else {
        setFollowersCount(countRes.count ?? 0);
      }

      // following state
      if (user?.id) {
        const col = await detectFollowsSchema(user.id, ministryId);
        setFollowsUserCol(col);

        const q = supabase
          .from("ministry_follows")
          .select("ministry_id")
          .eq("ministry_id", ministryId)
          .eq(col, user.id)
          .maybeSingle();

        const { data: f, error: fErr } = await q;
        if (fErr) {
          console.log("[follow state error]", fErr.message);
          setIsFollowing(false);
        } else {
          setIsFollowing(!!f);
        }
      } else {
        setIsFollowing(false);
      }
    } finally {
      setLoading(false);
    }
  }, [ministryId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleFollow() {
    if (!ministryId) return;

    if (!user?.id) {
      Alert.alert("sign in required", "sign in to follow ministries.");
      router.push("/login" as any);
      return;
    }

    if (followBusy) return;
    setFollowBusy(true);

    try {
      const col = followsUserCol;

      if (isFollowing) {
        const del = await supabase
          .from("ministry_follows")
          .delete()
          .eq("ministry_id", ministryId)
          .eq(col, user.id);

        if (del.error) throw del.error;

        setIsFollowing(false);
        setFollowersCount((n) => Math.max(0, n - 1));
      } else {
        const payload: any = { ministry_id: ministryId, [col]: user.id };
        const ins = await supabase.from("ministry_follows").insert(payload);

        // If schema detection was wrong, try the other column once.
        if (ins.error) {
          const altCol = col === "user_id" ? "follower_id" : "user_id";
          const altPayload: any = { ministry_id: ministryId, [altCol]: user.id };
          const ins2 = await supabase.from("ministry_follows").insert(altPayload);
          if (ins2.error) throw ins2.error;
          setFollowsUserCol(altCol);
        }

        setIsFollowing(true);
        setFollowersCount((n) => n + 1);
      }
    } catch (e: any) {
      console.log("[toggle follow error]", e?.message ?? e);
      Alert.alert("couldn’t update follow", e?.message ?? "something went wrong.");
      // re-sync
      await load();
    } finally {
      setFollowBusy(false);
    }
  }

  if (!ministryId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>missing ministry id.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.topBtn, { backgroundColor: glass, borderColor: border }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onRefresh}
          style={[styles.topBtn, { backgroundColor: glass, borderColor: border }]}
        >
          <Ionicons name="refresh" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* cover */}
        <View style={[styles.coverWrap, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverFallback, { backgroundColor: colors.card2 }]}>
              <Ionicons name="image-outline" size={26} color={colors.muted} />
              <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>no cover image</Text>
            </View>
          )}
          <View style={styles.coverOverlay} />

          <View style={styles.coverText}>
            <View style={styles.headerRow}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { fontFamily: fonts.display }]} numberOfLines={2}>
                  {name}
                </Text>
                {subtitle ? (
                  <Text style={[styles.meta, { fontFamily: fonts.body }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statPill, { backgroundColor: "rgba(73,8,176,0.16)", borderColor: "rgba(255,255,255,0.18)" }]}>
                <Ionicons name="people-outline" size={14} color="#fff" />
                <Text style={[styles.statText, { fontFamily: fonts.strong }]}>{followersCount} followers</Text>
              </View>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={toggleFollow}
                disabled={followBusy}
                style={[
                  styles.followBtn,
                  {
                    backgroundColor: isFollowing ? "rgba(73,8,176,0.34)" : "rgba(255,255,255,0.10)",
                    borderColor: "rgba(255,255,255,0.18)",
                    opacity: followBusy ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons name={isFollowing ? "checkmark-circle" : "add-circle-outline"} size={18} color="#fff" />
                <Text style={[styles.followText, { fontFamily: fonts.strong }]}>
                  {followBusy ? "…" : isFollowing ? "following" : "follow"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* about */}
        {bio ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <View style={[styles.bodyCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Text style={[styles.bodyTitle, { color: colors.text, fontFamily: fonts.display }]}>about</Text>
              <Text style={[styles.bodyText, { color: colors.text, fontFamily: fonts.body }]}>{bio}</Text>
            </View>
          </View>
        ) : null}

        {/* events */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>
            events
          </Text>

          {loading ? (
            <View style={[styles.loadingRow, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <ActivityIndicator />
              <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>loading…</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={[styles.emptyRow, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={18} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>
                no events linked to this ministry yet.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {events.map((e) => (
                <Pressable
                  key={`min-ev-${e.id}`}
                  onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
                  style={[styles.eventRow, { backgroundColor: colors.card2, borderColor: colors.border }]}
                >
                  <Image source={{ uri: e.cover_image || initialsAvatar(e.title) }} style={styles.eventThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                      {e.title.toLowerCase()}
                    </Text>
                    <Text style={[styles.eventMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                      {formatWhen(e.start_time).toLowerCase()}
                    </Text>
                    <Text style={[styles.eventMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                      {(e.location ?? "location tbd").toLowerCase()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { opacity: 0.75, fontWeight: "700", textTransform: "lowercase" },

  topBar: {
    position: "absolute",
    zIndex: 10,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  topBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  coverWrap: { width: "100%", height: 420, overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.40)" },

  coverText: { ...StyleSheet.absoluteFillObject, padding: 16, justifyContent: "flex-end" },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#111" },

  title: { color: "#fff", fontSize: 20, fontWeight: "900", textTransform: "lowercase" },
  meta: { color: "rgba(255,255,255,0.86)", marginTop: 4, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  statsRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 },
  statPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  statText: { color: "#fff", fontWeight: "800", fontSize: 12, textTransform: "lowercase" },

  followBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  followText: { color: "#fff", fontWeight: "900", fontSize: 12, textTransform: "lowercase" },

  bodyCard: { borderRadius: 18, borderWidth: 1, padding: 14 },
  bodyTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  bodyText: { marginTop: 10, fontSize: 14, lineHeight: 20, fontWeight: "700", textTransform: "lowercase" },

  sectionTitle: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },

  loadingRow: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyRow: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { fontWeight: "600", flex: 1, lineHeight: 18, textTransform: "lowercase" },

  eventRow: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  eventThumb: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#111" },
  eventTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  eventMeta: { marginTop: 3, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
});
