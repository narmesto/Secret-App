// app/(tabs)/social.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
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

type ProfileLite = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type FriendRequestRow = {
  id: string;
  from_user: string; // requester
  to_user: string; // receiver
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

type DMThread = {
  peer: ProfileLite;
  last_message: string | null;
  last_at: string | null;
};

type CommunityRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  kind: "ministry" | "community";
};

type ThreadPreview = {
  community: CommunityRow;
  last_message: string | null;
  last_at: string | null;
};

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
}

function pickName(p: ProfileLite) {
  const n = String(p.display_name ?? p.username ?? "user").trim();
  return n.length ? n : "user";
}

function formatShortTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric" }).toLowerCase();
}

/**
 * pair for friendships(user_low,user_high)
 */
function pair(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return { user_low: low, user_high: high };
}

/**
 * Robust profile lookup: tries columns with display_name + username,
 * and falls back if a column doesn't exist.
 */
async function safeFetchProfilesByIds(ids: string[]): Promise<ProfileLite[]> {
  if (!ids.length) return [];

  // Try both
  {
    const { data, error } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", ids);
    if (!error) return (data ?? []) as any;
  }

  // Fallback display_name
  {
    const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids);
    if (!error) return (data ?? []) as any;
  }

  // Fallback username
  {
    const { data, error } = await supabase.from("profiles").select("id, username, avatar_url").in("id", ids);
    if (!error) return (data ?? []) as any;
  }

  return [];
}

/**
 * Robust people search: tries searching display_name OR username.
 */
async function safePeopleSearch(userId: string, q: string): Promise<ProfileLite[]> {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];

  // Try searching both columns (best UX)
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .neq("id", userId)
      .or(`display_name.ilike.${query}%,username.ilike.${query}%`)
      .order("display_name", { ascending: true })
      .limit(15);

    if (!error) return (data ?? []) as any;
  }

  // Fallback: display_name only
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .neq("id", userId)
      .ilike("display_name", `${query}%`)
      .order("display_name", { ascending: true })
      .limit(15);

    if (!error) return (data ?? []) as any;
  }

  // Fallback: username only
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .neq("id", userId)
      .ilike("username", `${query}%`)
      .order("username", { ascending: true })
      .limit(15);

    if (!error) return (data ?? []) as any;
  }

  return [];
}

export default function SocialScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await init();
    setRefreshing(false);
  }, [user?.id]);

  // inbox (friend requests)
  const [inboxOpen, setInboxOpen] = useState(false);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);

  // DMs + Threads
  const [dmThreads, setDmThreads] = useState<DMThread[]>([]);
  const [threads, setThreads] = useState<ThreadPreview[]>([]);

  // TOP search bar is for PEOPLE LOOKUP
  const [peopleQuery, setPeopleQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleResults, setPeopleResults] = useState<ProfileLite[]>([]);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(peopleQuery.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [peopleQuery]);

  useFocusEffect(
    useCallback(() => {
      init();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])
  );

  async function init() {
    if (!user?.id) {
      setRequests([]);
      setDmThreads([]);
      setThreads([]);
      return;
    }

    try {
      await Promise.all([fetchFriendRequests(), fetchDMThreads(), fetchCombinedThreads()]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchFriendRequests() {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_low, user_high, requested_by, status, created_at")
      .eq("status", "pending")
      .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
      .neq("requested_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("[social friendships inbox error]", error.message);
      setRequests([]);
      return;
    }

    const mapped: FriendRequestRow[] = (data ?? []).map((r: any) => {
      const low = String(r.user_low);
      const high = String(r.user_high);
      const requester = String(r.requested_by);

      const receiver = requester === low ? high : low;

      return {
        id: String(r.id),
        from_user: requester,
        to_user: receiver,
        status: r.status as any,
        created_at: String(r.created_at),
      };
    });

    setRequests(mapped);
  }

  async function fetchDMThreads() {
  if (!user?.id) return;

  // 1) Accepted friendships involving me
  const { data: friends, error: frErr } = await supabase
    .from("friendships")
    .select("id, user_low, user_high, status, created_at")
    .eq("status", "accepted")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (frErr) {
    console.log("[social dm friendships error]", frErr.message);
    setDmThreads([]);
    return;
  }

  const friendRows = friends ?? [];

  const peerIds = Array.from(
    new Set(
      friendRows
        .map((r: any) => {
          const low = String(r.user_low);
          const high = String(r.user_high);
          return user.id === low ? high : low;
        })
        .filter(Boolean)
    )
  );

  if (peerIds.length === 0) {
    setDmThreads([]);
    return;
  }

  // 2) Profiles for peers
  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", peerIds);

  if (profErr) {
    console.log("[social dm profiles error]", profErr.message);
    setDmThreads([]);
    return;
  }

  const profById = new Map<string, ProfileLite>();
  (profs ?? []).forEach((p: any) => profById.set(String(p.id), p as any));

  // 3) DM threads involving me (we'll intersect with friend peers)
  const { data: threads, error: thErr } = await supabase
    .from("dm_threads")
    .select("id, user_low, user_high, created_at")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`);

  if (thErr) {
    console.log("[social dm_threads error]", thErr.message);
  }

  const threadIdByPeer = new Map<string, string>();
  (threads ?? []).forEach((t: any) => {
    const low = String(t.user_low);
    const high = String(t.user_high);
    const peer = user.id === low ? high : low;
    if (peerIds.includes(peer)) threadIdByPeer.set(peer, String(t.id));
  });

  const threadIds = Array.from(new Set(Array.from(threadIdByPeer.values())));

  // 4) Latest message per thread (batch pull)
  const lastByThread = new Map<string, { body: string | null; created_at: string | null }>();

  if (threadIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from("dm_messages")
      .select("thread_id, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(300);

    if (msgErr) {
      console.log("[social dm_messages preview error]", msgErr.message);
    } else {
      for (const m of msgs ?? []) {
        const tid = String((m as any).thread_id);
        if (!lastByThread.has(tid)) {
          lastByThread.set(tid, {
            body: ((m as any).body ?? null) ? String((m as any).body) : null,
            created_at: (m as any).created_at ? String((m as any).created_at) : null,
          });
        }
      }
    }
  }

  const out: DMThread[] = peerIds
    .map((pid) => {
      const peer = profById.get(pid) ?? { id: pid, display_name: "user", avatar_url: null };
      const tid = threadIdByPeer.get(pid);
      const last = tid ? lastByThread.get(tid) : null;

      return {
        peer,
        last_message: last?.body ?? null,
        last_at: last?.created_at ?? null,
      };
    })
    // sort by most recent message, fallback name
    .sort((a, b) => {
      const ta = a.last_at ? new Date(a.last_at).getTime() : 0;
      const tb = b.last_at ? new Date(b.last_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (a.peer.display_name ?? "").localeCompare(b.peer.display_name ?? "");
    });

  setDmThreads(out);
}


  async function fetchCombinedThreads() {
    if (!user?.id) return;

    // 1) Ministries you follow
    const { data: follows, error: fErr } = await supabase
      .from("ministry_follows")
      .select("ministry_id")
      .eq("user_id", user.id);

    if (fErr) console.log("[social ministry_follows error]", fErr.message);

    const ministryIds = Array.from(new Set((follows ?? []).map((x: any) => String(x.ministry_id)).filter(Boolean)));

    let ministries: CommunityRow[] = [];
    if (ministryIds.length > 0) {
      const { data: mins, error: mErr } = await supabase
        .from("ministries")
        .select("id, name, avatar_url")
        .in("id", ministryIds)
        .order("name", { ascending: true });

      if (mErr) console.log("[social ministries error]", mErr.message);
      else {
        ministries = (mins ?? []).map((m: any) => ({
          id: String(m.id),
          name: String(m.name ?? "ministry"),
          avatar_url: m.avatar_url ?? null,
          kind: "ministry",
        }));
      }
    }

    // 2) ministries you’re a member of
    const { data: memberships, error: memErr } = await supabase
      .from("ministry_follows")
      .select("ministry_id")
      .eq("user_id", user.id);

    if (memErr) console.log("[social ministry_follows error]", memErr.message);

    const communityIds = Array.from(new Set((memberships ?? []).map((x: any) => String(x.community_id)).filter(Boolean)));

    let communities: CommunityRow[] = [];
    if (communityIds.length > 0) {
      const { data: comms, error: cErr } = await supabase
        .from("communities")
        .select("id, name, avatar_url")
        .in("id", communityIds)
        .order("name", { ascending: true });

      if (cErr) console.log("[social communities error]", cErr.message);
      else {
        communities = (comms ?? []).map((c: any) => ({
          id: String(c.id),
          name: String(c.name ?? "community"),
          avatar_url: c.avatar_url ?? null,
          kind: "community",
        }));
      }
    }

    const all = [...ministries, ...communities];
    const previews = await buildLastMessagePreviews(all);

    previews.sort((a, b) => {
      const ta = a.last_at ? new Date(a.last_at).getTime() : 0;
      const tb = b.last_at ? new Date(b.last_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.community.name.localeCompare(b.community.name);
    });

    setThreads(previews);
  }

  async function buildLastMessagePreviews(all: CommunityRow[]): Promise<ThreadPreview[]> {
    const ministryIds = all.filter((x) => x.kind === "ministry").map((x) => x.id);
    const communityIds = all.filter((x) => x.kind === "community").map((x) => x.id);

    const lastMin = new Map<string, { body: string; created_at: string }>();
    const lastCom = new Map<string, { body: string; created_at: string }>();

    if (ministryIds.length > 0) {
      const { data, error } = await supabase
        .from("ministry_messages")
        .select("ministry_id, body, created_at")
        .in("ministry_id", ministryIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error) {
        for (const row of data ?? []) {
          const id = String((row as any).ministry_id);
          if (!lastMin.has(id)) {
            lastMin.set(id, {
              body: String((row as any).body ?? ""),
              created_at: String((row as any).created_at),
            });
          }
        }
      } else {
        console.log("[social ministry_messages preview error]", error.message);
      }
    }

    if (communityIds.length > 0) {
      const { data, error } = await supabase
        .from("community_messages")
        .select("community_id, body, created_at")
        .in("community_id", communityIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error) {
        for (const row of data ?? []) {
          const id = String((row as any).community_id);
          if (!lastCom.has(id)) {
            lastCom.set(id, {
              body: String((row as any).body ?? ""),
              created_at: String((row as any).created_at),
            });
          }
        }
      } else {
        console.log("[social community_messages preview error]", error.message);
      }
    }

    return all.map((c) => {
      const last = c.kind === "ministry" ? lastMin.get(c.id) : lastCom.get(c.id);
      return { community: c, last_message: last?.body ?? null, last_at: last?.created_at ?? null };
    });
  }

  // ---------- LIVE PEOPLE SEARCH ----------
  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (!user?.id) return;

      const q = debouncedQuery;

      if (q.length < 2) {
        setPeopleResults([]);
        setPeopleLoading(false);
        return;
      }

      setPeopleLoading(true);

      const results = await safePeopleSearch(user.id, q);
      if (cancelled) return;

      const cleaned: ProfileLite[] = (results ?? [])
        .map((p: any) => ({
          id: String(p.id),
          display_name: (p as any).display_name ?? null,
          username: (p as any).username ?? null,
          avatar_url: (p as any).avatar_url ?? null,
        }))
        .filter((p) => pickName(p).trim().length > 0);

      setPeopleResults(cleaned);
      setPeopleLoading(false);
    }

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, user?.id]);

  async function sendFriendRequest(otherUserId: string) {
    if (!user?.id) return;

    if (otherUserId === user.id) {
      return Alert.alert("nice try", "you can’t add yourself.");
    }

    const { user_low, user_high } = pair(user.id, otherUserId);

    try {
      const { data: existing, error: exErr } = await supabase
        .from("friendships")
        .select("id, status, requested_by")
        .eq("user_low", user_low)
        .eq("user_high", user_high)
        .maybeSingle();

      if (!exErr && existing?.id) {
        setSentTo((prev) => new Set(prev).add(otherUserId));
        return Alert.alert("already exists", `status: ${String(existing.status)}`);
      }

      const { error } = await supabase.from("friendships").insert({
        user_low,
        user_high,
        requested_by: user.id,
        status: "pending",
      });

      if (error) return Alert.alert("couldn’t send", error.message);

      setSentTo((prev) => new Set(prev).add(otherUserId));
      Alert.alert("sent", "friend request sent.");
      await fetchFriendRequests();
    } catch (e: any) {
      Alert.alert("error", e?.message ?? "something went wrong");
    }
  }

  async function acceptRequest(req: FriendRequestRow) {
    if (!user?.id) return;

    try {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", req.id);
      if (error) return Alert.alert("couldn’t accept", error.message);

      await Promise.all([fetchFriendRequests(), fetchDMThreads()]);
    } catch (e: any) {
      Alert.alert("error", e?.message ?? "something went wrong");
    }
  }

  async function declineRequest(req: FriendRequestRow) {
    if (!user?.id) return;

    try {
      const { error } = await supabase.from("friendships").update({ status: "declined" }).eq("id", req.id);
      if (error) return Alert.alert("couldn’t decline", error.message);

      await fetchFriendRequests();
    } catch (e: any) {
      Alert.alert("error", e?.message ?? "something went wrong");
    }
  }

  function openDM(peerId: string) {
    router.push(`/social/dm/${peerId}` as any);
  }

  function openThread(item: ThreadPreview) {
    if (item.community.kind === "ministry") router.push(`/social/ministry/${item.community.id}` as any);
    else router.push(`/social/community/${item.community.id}` as any);
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.display }]}>social</Text>
          <Text style={[styles.sub, { color: colors.muted, fontFamily: fonts.body }]}>
            sign in to message friends and join threads.
          </Text>
          <Pressable
            onPress={() => router.replace("/login" as any)}
            style={[styles.primaryBtn, { backgroundColor: "rgba(73,8,176,0.14)", borderColor: softBorder }]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.text, fontFamily: fonts.strong }]}>go to login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          {/* Invisible spacer to balance the layout */}
          <View style={{ width: 80 }} />

          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.display }]}>
            social
          </Text>

          <View style={{ flexDirection: "row", gap: 10, width: 80, justifyContent: "flex-end" }}>
            <Pressable
              onPress={() => router.push("/social/create-group" as any)}
              style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card2 }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={() => router.push("/social/inbox" as any)}
              style={[styles.headerBtn, { borderColor: colors.border, backgroundColor: colors.card2 }]}
            >
              <Ionicons name="mail-outline" size={18} color={colors.text} />
              {pendingCount > 0 && <View style={styles.badge} />}
            </Pressable>
          </View>
        </View>
        {/* TOP SEARCH */}
        <View style={[styles.searchWrap, { backgroundColor: glass, borderColor: softBorder }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={peopleQuery}
            onChangeText={(t) => {
              setPeopleQuery(t);
              setSentTo(new Set());
            }}
            placeholder="search users..."
            placeholderTextColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(17,17,24,0.45)"}
            style={[styles.searchInput, { color: colors.text, fontFamily: fonts.body }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {peopleLoading ? (
            <View style={styles.searchSpinner}>
              <ActivityIndicator />
            </View>
          ) : null}
        </View>

        {/* People results */}
        {peopleQuery.trim().length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>people</Text>

            {peopleLoading ? (
              <LoadingCard colors={colors} fonts={fonts} />
            ) : peopleResults.length === 0 ? (
              <Text style={[styles.helper, { color: colors.muted, fontFamily: fonts.body }]}>
                {peopleQuery.trim().length < 2 ? "type at least 2 letters." : "no users found."}
              </Text>
            ) : (
              <View style={{ gap: 10, marginTop: 10 }}>
                {peopleResults.map((p) => {
                  const name = pickName(p).toLowerCase();
                  const avatar = p.avatar_url || initialsAvatar(name);
                  const alreadySent = sentTo.has(p.id);

                  return (
                    <View
                      key={`person-${p.id}`}
                      style={[styles.personRow, { backgroundColor: colors.card2, borderColor: colors.border }]}
                    >
                      <Image source={{ uri: avatar }} style={styles.personAvatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.personName, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={[styles.personMeta, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                          tap add to send request
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => sendFriendRequest(p.id)}
                        disabled={alreadySent}
                        style={[
                          styles.personBtn,
                          {
                            backgroundColor: alreadySent ? "rgba(120,120,130,0.10)" : "rgba(73,8,176,0.12)",
                            borderColor: alreadySent ? "rgba(120,120,130,0.18)" : "rgba(73,8,176,0.28)",
                            opacity: alreadySent ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.personBtnText, { color: colors.text, fontFamily: fonts.strong }]}>
                          {alreadySent ? "sent" : "add"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* THREADS */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>threads</Text>
          <Text style={[styles.sectionSub, { color: colors.muted, fontFamily: fonts.body }]}>
            ministries you follow + communities you’re in
          </Text>
        </View>

        {loading ? (
          <LoadingCard colors={colors} fonts={fonts} />
        ) : threads.length === 0 ? (
          <EmptyCard colors={colors} fonts={fonts} text="no threads yet. follow a ministry or join a community." />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            {threads.map((t, idx) => (
              <Pressable
                key={`thread-${t.community.kind}-${t.community.id}`}
                onPress={() => openThread(t)}
                style={[styles.row, { borderTopColor: colors.border }, idx === 0 ? { borderTopWidth: 0 } : null]}
              >
                <Image source={{ uri: t.community.avatar_url || initialsAvatar(t.community.name) }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                      {t.community.name.toLowerCase()}
                    </Text>
                    <View style={[styles.kindPill, { borderColor: colors.border, backgroundColor: "rgba(73,8,176,0.10)" }]}>
                      <Text style={[styles.kindText, { color: colors.text, fontFamily: fonts.strong }]}>{t.community.kind}</Text>
                    </View>
                  </View>
                  <Text style={[styles.rowSub, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                    {(t.last_message ?? "tap to open the thread").toLowerCase()}
                  </Text>
                </View>
                <Text style={[styles.time, { color: colors.muted, fontFamily: fonts.body }]}>{formatShortTime(t.last_at)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* DMs */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>dms</Text>
          <Text style={[styles.sectionSub, { color: colors.muted, fontFamily: fonts.body }]}>friends only (accepted)</Text>
        </View>

        {loading ? (
          <LoadingCard colors={colors} fonts={fonts} />
        ) : dmThreads.length === 0 ? (
          <EmptyCard colors={colors} fonts={fonts} text="no dms yet. accept a friend request to start chatting." />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            {dmThreads.map((t, idx) => {
              const name = pickName(t.peer).toLowerCase();
              return (
                <Pressable
                  key={`dm-${t.peer.id}`}
                  onPress={() => openDM(t.peer.id)}
                  style={[styles.row, { borderTopColor: colors.border }, idx === 0 ? { borderTopWidth: 0 } : null]}
                >
                  <Image source={{ uri: t.peer.avatar_url || initialsAvatar(name) }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
                      {(t.last_message ?? "tap to message").toLowerCase()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 18 }} />
      </ScrollView>

      {/* Inbox modal */}
      <Modal visible={inboxOpen} animationType="slide" transparent onRequestClose={() => setInboxOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontFamily: fonts.display }]}>inbox</Text>
              <Pressable
                onPress={() => setInboxOpen(false)}
                style={[styles.modalClose, { backgroundColor: colors.card2, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.modalSub, { color: colors.muted, fontFamily: fonts.body }]}>friend requests</Text>

            {loading ? (
              <View style={{ marginTop: 12, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : requests.filter((r) => r.status === "pending").length === 0 ? (
              <View style={[styles.emptyInbox, { backgroundColor: colors.card2, borderColor: colors.border }]}>
                <Text style={[styles.emptyInboxText, { color: colors.muted, fontFamily: fonts.body }]}>no requests right now.</Text>
              </View>
            ) : (
              <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ paddingBottom: 14 }}>
                <InboxList requests={requests} colors={colors} fonts={fonts} onAccept={acceptRequest} onDecline={declineRequest} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- inbox list ---------- */

function InboxList({
  requests,
  colors,
  fonts,
  onAccept,
  onDecline,
}: {
  requests: FriendRequestRow[];
  colors: any;
  fonts: any;
  onAccept: (r: FriendRequestRow) => void;
  onDecline: (r: FriendRequestRow) => void;
}) {
  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);

  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        if (pending.length === 0) return;

        setBusy(true);
        try {
          const fromIds = Array.from(new Set(pending.map((r) => r.from_user)));
          const profs = await safeFetchProfilesByIds(fromIds);

          if (!mounted) return;

          const m = new Map<string, ProfileLite>();
          (profs ?? []).forEach((p: any) => m.set(String(p.id), p as any));
          setProfiles(m);
        } finally {
          if (mounted) setBusy(false);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [pending.length])
  );

  return (
    <View style={{ gap: 10 }}>
      {busy ? <ActivityIndicator /> : null}

      {pending.map((r) => {
        const from = profiles.get(r.from_user);
        const name = pickName(from ?? { id: r.from_user }).toLowerCase();
        const avatar = from?.avatar_url || initialsAvatar(name);

        return (
          <View key={`req-${r.id}`} style={[styles.inboxRow, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Image source={{ uri: avatar }} style={styles.inboxAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.inboxName, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.inboxMeta, { color: colors.muted, fontFamily: fonts.body }]}>wants to be friends</Text>
            </View>

            <Pressable
              onPress={() => onDecline(r)}
              style={[styles.inboxBtn, { borderColor: "rgba(255,77,77,0.28)", backgroundColor: "rgba(255,77,77,0.06)" }]}
            >
              <Text style={[styles.inboxBtnText, { color: "#ff4d4d", fontFamily: fonts.strong }]}>decline</Text>
            </Pressable>

            <Pressable
              onPress={() => onAccept(r)}
              style={[styles.inboxBtn, { borderColor: "rgba(73,8,176,0.28)", backgroundColor: "rgba(73,8,176,0.12)" }]}
            >
              <Text style={[styles.inboxBtnText, { color: colors.text, fontFamily: fonts.strong }]}>accept</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/* ---------- small UI ---------- */

function LoadingCard({ colors, fonts }: { colors: any; fonts: any }) {
  return (
    <View style={[styles.loadingCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <ActivityIndicator />
      <Text style={[styles.loadingText, { color: colors.muted, fontFamily: fonts.strong }]}>loading…</Text>
    </View>
  );
}

function EmptyCard({ colors, fonts, text }: { colors: any; fonts: any; text: string }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <Ionicons name="sparkles-outline" size={18} color="rgba(120,120,130,0.9)" />
      <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>{text.toLowerCase()}</Text>
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  title: { fontSize: 18, fontWeight: "800", textTransform: "lowercase" },
  sub: { marginTop: 8, fontSize: 12, fontWeight: "700", lineHeight: 16, textTransform: "lowercase", textAlign: "center" },

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

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", letterSpacing: 0.6, textTransform: "lowercase" },

  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "rgba(251,113,133,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 10 },

  container: { padding: 16, paddingBottom: 28 },

  helper: { marginTop: 8, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  searchWrap: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "700", textTransform: "lowercase" },
  searchSpinner: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  personRow: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  personAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#111" },
  personName: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  personMeta: { marginTop: 2, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
  personBtn: { height: 34, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  personBtnText: { fontWeight: "900", fontSize: 12, textTransform: "lowercase" },

  sectionHeader: { marginTop: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 16, letterSpacing: 0.4, fontWeight: "700", textTransform: "lowercase" },
  sectionSub: { marginTop: 2, fontSize: 12, fontWeight: "600", textTransform: "lowercase" },

  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#111" },
  rowTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  rowSub: { marginTop: 2, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
  time: { fontSize: 11, fontWeight: "700", textTransform: "lowercase" },

  kindPill: { height: 22, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  kindText: { fontSize: 11, fontWeight: "900", textTransform: "lowercase" },

  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  loadingText: { fontWeight: "700", textTransform: "lowercase" },

  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { fontWeight: "600", flex: 1, lineHeight: 18, textTransform: "lowercase" },

  // modal
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", padding: 14, justifyContent: "flex-end" },
  modalCard: { borderRadius: 22, borderWidth: 1, padding: 14, maxHeight: "78%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 16, fontWeight: "900", textTransform: "lowercase" },
  modalClose: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modalSub: { marginTop: 6, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  emptyInbox: { marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 14, alignItems: "center" },
  emptyInboxText: { fontWeight: "700", textTransform: "lowercase" },

  inboxRow: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  inboxAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#111" },
  inboxName: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  inboxMeta: { marginTop: 2, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
  inboxBtn: { height: 34, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  inboxBtnText: { fontWeight: "900", fontSize: 12, textTransform: "lowercase" },
});
