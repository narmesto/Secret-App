// app/user/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

/* ---------------- types ---------------- */

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type MiniMinistry = {
  id: string;
  name: string;
  avatar_url: string | null;
  city: string | null;
};

/* ---------------- helpers ---------------- */

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

function pair(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return { user_low: low, user_high: high };
}

/**
 * Friendships table schema varies a lot. Detect one of:
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

/** ministry_follows schema detection:
 * A) ministry_follows(user_id, ministry_id)
 * B) ministry_follows(follower_id, ministry_id)
 */
async function detectMinistryFollowUserColumn() {
  const a = await supabase.from("ministry_follows").select("user_id").limit(1);
  if (!a.error) return "user_id" as const;

  const b = await supabase.from("ministry_follows").select("follower_id").limit(1);
  if (!b.error) return "follower_id" as const;

  return "user_id" as const;
}

/* ---------------- screen ---------------- */

export default function PublicUserProfile() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams();
  const viewedUserId = useMemo(() => {
    const raw = (params as any)?.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").trim();
  }, [params]);

  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!viewedUserId) return;
    if (!user?.id) return;
    if (user.id !== viewedUserId) return;

    // prevent repeated replaces (can happen during refresh / strict mode)
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    router.replace("/(tabs)/profile" as any);
  }, [user?.id, viewedUserId]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // counts only
  const [friendsCount, setFriendsCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [rsvpCount, setRsvpCount] = useState(0);

  // ministries show cards
  const [followedMinistries, setFollowedMinistries] = useState<MiniMinistry[]>([]);

  const [friendSchema, setFriendSchema] = useState<"A" | "B" | "C">("A");
  const [ministryUserCol, setMinistryUserCol] = useState<"user_id" | "follower_id">("user_id");

  const [isFriend, setIsFriend] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  const displayName = useMemo(() => {
    const n = profile?.display_name?.trim();
    if (n) return n.toLowerCase();
    return "user";
  }, [profile?.display_name]);

  const avatarUri = useMemo(() => {
    if (profile?.avatar_url) return profile.avatar_url;
    return initialsAvatar(displayName || "user");
  }, [profile?.avatar_url, displayName]);

  const canAddFriend = useMemo(() => {
    if (!user?.id) return false;
    if (!viewedUserId) return false;
    return user.id !== viewedUserId;
  }, [user?.id, viewedUserId]);

  const load = useCallback(async () => {
    if (!viewedUserId) return;

    setLoading(true);
    try {
      const [fs, mcol] = await Promise.all([detectFriendshipSchema(), detectMinistryFollowUserColumn()]);
      setFriendSchema(fs);
      setMinistryUserCol(mcol);

      // profile
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .eq("id", viewedUserId)
        .maybeSingle();

      if (pErr) {
        console.log("[user profile fetch error]", pErr.message);
        setProfile(null);
      } else {
        setProfile((p ?? null) as any);
      }

      // saved count
      {
        const r = await supabase.from("event_saves").select("event_id").eq("user_id", viewedUserId);
        if (r.error) console.log("[user saved count error]", r.error.message);
        setSavedCount((r.data ?? []).length);
      }

      // rsvp count
      {
        const r = await supabase.from("event_rsvps").select("event_id").eq("user_id", viewedUserId);
        if (r.error) console.log("[user rsvp count error]", r.error.message);
        setRsvpCount((r.data ?? []).length);
      }

      await loadFriendsCountAndState(fs);
      await loadFollowedMinistries(mcol);
    } finally {
      setLoading(false);
    }
  }, [viewedUserId, user?.id]);

  async function loadFriendsCountAndState(schema: "A" | "B" | "C") {
    if (!viewedUserId) return;

    let rows: any[] = [];
    if (schema === "A") {
      const r = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${viewedUserId},friend_id.eq.${viewedUserId}`)
        .limit(1000);
      if (r.error) console.log("[friends A error]", r.error.message);
      rows = r.data ?? [];
    } else if (schema === "B") {
      const r = await supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${viewedUserId},addressee_id.eq.${viewedUserId}`)
        .limit(1000);
      if (r.error) console.log("[friends B error]", r.error.message);
      rows = r.data ?? [];
    } else {
      const r = await supabase
        .from("friendships")
        .select("*")
        .or(`user_low.eq.${viewedUserId},user_high.eq.${viewedUserId}`)
        .limit(1000);
      if (r.error) console.log("[friends C error]", r.error.message);
      rows = r.data ?? [];
    }

    const accepted = rows.filter((r) => {
      const s = (r?.status ?? "").toString().toLowerCase().trim();
      if (!s) return true;
      return s === "accepted" || s === "friends" || s === "active";
    });

    const friendIds = new Set<string>();
    for (const r of accepted) {
      if (schema === "A") {
        const a = String(r.user_id ?? "");
        const b = String(r.friend_id ?? "");
        const other = a === viewedUserId ? b : a;
        if (other) friendIds.add(other);
      } else if (schema === "B") {
        const a = String(r.requester_id ?? "");
        const b = String(r.addressee_id ?? "");
        const other = a === viewedUserId ? b : a;
        if (other) friendIds.add(other);
      } else {
        const a = String(r.user_low ?? "");
        const b = String(r.user_high ?? "");
        const other = a === viewedUserId ? b : a;
        if (other) friendIds.add(other);
      }
    }
    setFriendsCount(friendIds.size);

    // isFriend (viewer -> viewed)
    if (!user?.id || user.id === viewedUserId) {
      setIsFriend(false);
      return;
    }

    let found = false;
    if (schema === "A") {
      const r = await supabase
        .from("friendships")
        .select("*")
        .or(
          `and(user_id.eq.${user.id},friend_id.eq.${viewedUserId}),and(user_id.eq.${viewedUserId},friend_id.eq.${user.id})`
        )
        .maybeSingle();

      if (!r.error && r.data) {
        const s = (r.data?.status ?? "").toString().toLowerCase().trim();
        found = !s || s === "accepted" || s === "friends" || s === "active" || s === "pending";
      }
    } else if (schema === "B") {
      const r = await supabase
        .from("friendships")
        .select("*")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${viewedUserId}),and(requester_id.eq.${viewedUserId},addressee_id.eq.${user.id})`
        )
        .maybeSingle();

      if (!r.error && r.data) {
        const s = (r.data?.status ?? "").toString().toLowerCase().trim();
        found = !s || s === "accepted" || s === "friends" || s === "active" || s === "pending";
      }
    } else {
      const { user_low, user_high } = pair(user.id, viewedUserId);
      const r = await supabase
        .from("friendships")
        .select("*")
        .eq("user_low", user_low)
        .eq("user_high", user_high)
        .maybeSingle();

      if (!r.error && r.data) {
        const s = (r.data?.status ?? "").toString().toLowerCase().trim();
        found = !s || s === "accepted" || s === "friends" || s === "active" || s === "pending";
      }
    }

    setIsFriend(found);
  }

  async function loadFollowedMinistries(userCol: "user_id" | "follower_id") {
    const { data: mf, error: mfErr } = await supabase
      .from("ministry_follows")
      .select("ministry_id, created_at")
      .eq(userCol, viewedUserId)
      .order("created_at", { ascending: false });

    if (mfErr) {
      console.log("[user followed ministries ids error]", mfErr.message);
      setFollowedMinistries([]);
      return;
    }

    const mids = (mf ?? []).map((x: any) => String(x.ministry_id)).filter(Boolean);
    if (!mids.length) {
      setFollowedMinistries([]);
      return;
    }

    const { data: mins, error: minsErr } = await supabase.from("ministries").select("*").in("id", mids);
    if (minsErr) {
      console.log("[user followed ministries fetch error]", minsErr.message);
      setFollowedMinistries([]);
      return;
    }

    const byId = new Map((mins ?? []).map((m: any) => [String(m.id), m]));
    const ordered = mids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((m: any) => ({
        id: String(m.id),
        name: String(m.name ?? m.display_name ?? m.title ?? "ministry"),
        avatar_url: m.avatar_url ?? m.logo_url ?? m.image_url ?? null,
        city: m.city ?? m.location ?? null,
      }));

    setFollowedMinistries(ordered);
  }

  useEffect(() => {
    if (!viewedUserId) return;
    load();
  }, [viewedUserId, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function onMessage() {
    if (!viewedUserId) return;
    router.push({ pathname: "/social/dm/[peerId]" as any, params: { peerId: viewedUserId } });
  }

  async function onAddFriend() {
    if (!canAddFriend) return;
    if (!user?.id) {
      Alert.alert("sign in required", "sign in to add friends.");
      router.push("/login" as any);
      return;
    }
    if (isFriend) return;
    if (addBusy) return;

    setAddBusy(true);
    try {
      if (friendSchema === "A") {
        const ins1 = await supabase.from("friendships").insert({
          user_id: user.id,
          friend_id: viewedUserId,
          status: "accepted",
          requested_by: user.id,
        });
        if (ins1.error) {
          const ins2 = await supabase.from("friendships").insert({
            user_id: user.id,
            friend_id: viewedUserId,
            requested_by: user.id,
          });
          if (ins2.error) throw ins2.error;
        }
      } else if (friendSchema === "B") {
        const ins1 = await supabase.from("friendships").insert({
          requester_id: user.id,
          addressee_id: viewedUserId,
          status: "accepted",
          requested_by: user.id,
        });
        if (ins1.error) {
          const ins2 = await supabase.from("friendships").insert({
            requester_id: user.id,
            addressee_id: viewedUserId,
            requested_by: user.id,
          });
          if (ins2.error) throw ins2.error;
        }
      } else {
        const { user_low, user_high } = pair(user.id, viewedUserId);
        const ins1 = await supabase.from("friendships").insert({
          user_low,
          user_high,
          status: "accepted",
          requested_by: user.id,
        });
        if (ins1.error) {
          const ins2 = await supabase.from("friendships").insert({ user_low, user_high, requested_by: user.id });
          if (ins2.error) throw ins2.error;
        }
      }

      setIsFriend(true);
      await loadFriendsCountAndState(friendSchema);
    } catch (e: any) {
      console.log("[add friend error]", e?.message ?? e);
      Alert.alert("couldn’t add friend", e?.message ?? "something went wrong.");
    } finally {
      setAddBusy(false);
    }
  }




  // ✅ RELIABLE ROUTES: build the actual path string
  function openFriendsPage() {
    router.push(`/user/${viewedUserId}/friends` as any);
  }
  function openSavedPage() {
    router.push(`/user/${viewedUserId}/saved` as any);
  }
  function openRsvpsPage() {
    router.push(`/user/${viewedUserId}/rsvps` as any);
  }

  if (!viewedUserId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>missing user id.</Text>
      </View>
    );
  }

    if (user?.id && user.id === viewedUserId) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* top overlay back */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={[styles.topBtn, { backgroundColor: glass, borderColor: border }]}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* header card */}
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 56 }}>
          <View style={[styles.headerCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />

            <Text style={[styles.name, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
              {displayName}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                onPress={onMessage}
                style={[styles.actionBtn, { backgroundColor: "rgba(73,8,176,0.14)", borderColor: colors.border }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.text} />
                <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.strong }]}>message</Text>
              </Pressable>

              <Pressable
                onPress={onAddFriend}
                disabled={!canAddFriend || addBusy || isFriend}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: isFriend ? "rgba(73,8,176,0.22)" : glass,
                    borderColor: colors.border,
                    opacity: !canAddFriend || addBusy ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons name={isFriend ? "checkmark-circle" : "person-add-outline"} size={16} color={colors.text} />
                <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.strong }]}>
                  {isFriend ? "added" : addBusy ? "…" : "add friend"}
                </Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={{ marginTop: 8, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : null}
          </View>
        </View>

        {/* buttons row */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View style={styles.statsRow}>
            <StatButton label="friends" value={String(friendsCount)} onPress={openFriendsPage} colors={colors} fonts={fonts} />
            <StatButton label="saved" value={String(savedCount)} onPress={openSavedPage} colors={colors} fonts={fonts} />
            <StatButton label="rsvpd" value={String(rsvpCount)} onPress={openRsvpsPage} colors={colors} fonts={fonts} />
          </View>
        </View>

        {/* ministries */}
        <SectionHeader title="followed ministries" colors={colors} fonts={fonts} />
        <View style={{ paddingHorizontal: 16 }}>
          {followedMinistries.length === 0 ? (
            <EmptyCard icon="compass-outline" text="no followed ministries." colors={colors} fonts={fonts} />
          ) : (
            <View style={{ gap: 10 }}>
              {followedMinistries.slice(0, 20).map((m) => {
                const av = m.avatar_url || initialsAvatar(m.name);
                return (
                  <Pressable
                    key={`min-${m.id}`}
                    onPress={() => router.push({ pathname: "/ministry/[id]" as any, params: { id: m.id } })}
                    style={[styles.rowCard, { backgroundColor: colors.card2, borderColor: colors.border }]}
                  >
                    <Image source={{ uri: av }} style={styles.rowAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                        {m.name.toLowerCase()}
                      </Text>
                      <Text style={[styles.rowSub, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                        {(m.city ?? "near you").toLowerCase()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

/* ---------------- components ---------------- */

function SectionHeader({ title, colors, fonts }: { title: string; colors: any; fonts: any }) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 18, marginBottom: 10 }}>
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.display,
          fontSize: 16,
          fontWeight: "900",
          textTransform: "lowercase",
        }}
      >
        {title.toLowerCase()}
      </Text>
    </View>
  );
}

function StatButton({
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
    <Pressable onPress={onPress} style={[styles.statBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text, fontFamily: fonts.display }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted, fontFamily: fonts.body }]}>{label}</Text>
    </Pressable>
  );
}

function EmptyCard({
  icon,
  text,
  colors,
  fonts,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  colors: any;
  fonts: any;
}) {
  return (
    <View style={[styles.empty, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>{text.toLowerCase()}</Text>
    </View>
  );
}

/* ---------------- styles ---------------- */

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

  headerCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 10,
  },
  avatar: { width: 74, height: 74, borderRadius: 26, backgroundColor: "#111" },
  name: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },

  actionRow: { flexDirection: "row", gap: 10, width: "100%" },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionText: { fontWeight: "900", fontSize: 12, textTransform: "lowercase" },

  statsRow: { flexDirection: "row", gap: 10 },
  statBtn: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },
  statLabel: { marginTop: 4, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  empty: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { fontWeight: "600", flex: 1, lineHeight: 18, textTransform: "lowercase" },

  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  rowAvatar: { width: 54, height: 54, borderRadius: 16, backgroundColor: "#111" },
  rowTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  rowSub: { marginTop: 3, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
});
