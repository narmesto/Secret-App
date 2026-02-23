// app/event/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

type Category = { id: string; name: string };

type EventDetailRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  cover_image: string | null;
  lat?: number | null;
  lng?: number | null;
  location_privacy: "public" | "private" | "none";
  ministry_id?: string | null; // ✅ added
  event_categories?: { categories: Category | Category[] | null }[] | null;
};

type MomentRow = {
  id: string;
  image_url: string;
  created_at: string;
};

/** ✅ change these if your table names differ */
const RSVP_TABLE = "event_rsvps";
const SAVE_TABLE = "event_saves";

function extractCategoryNames(event_categories: any[] | null | undefined): string[] {
  if (!event_categories) return [];
  const names: string[] = [];
  for (const ec of event_categories) {
    const c = ec?.categories;
    if (!c) continue;

    if (Array.isArray(c)) {
      for (const x of c) if (x?.name) names.push(String(x.name));
    } else if (c?.name) {
      names.push(String(c.name));
    }
  }
  return Array.from(new Set(names));
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

function toRad(x: number) {
  return (x * Math.PI) / 180;
}

// Haversine distance in miles
function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3958.7613;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export default function EventDetail() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams();
  const id = useMemo(() => {
    const raw = (params as any)?.id;
    const val = Array.isArray(raw) ? raw[0] : raw;
    return String(val ?? "").trim();
  }, [params]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [moments, setMoments] = useState<MomentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // location for miles-away
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [milesAway, setMilesAway] = useState<number | null>(null);

  // supabase toggles
  const [isSaved, setIsSaved] = useState(false);
  const [isRsvped, setIsRsvped] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyRsvp, setBusyRsvp] = useState(false);
  const [friendSaveCount, setFriendSaveCount] = useState(0);
  const [locationRequestStatus, setLocationRequestStatus] = useState<
    "none" | "pending" | "approved" | "denied"
  >("none");

  useEffect(() => {
    if (!id) return;
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  useEffect(() => {
    // compute miles once we have both coords
    if (!event?.lat || !event?.lng || !userCoords) {
      setMilesAway(null);
      return;
    }
    const dist = milesBetween(userCoords.lat, userCoords.lng, Number(event.lat), Number(event.lng));
    setMilesAway(dist);
  }, [event?.lat, event?.lng, userCoords]);

  async function init() {
    setLoading(true);
    await Promise.all([
      fetchEvent(),
      fetchMoments(),
      fetchUserLocation(),
      fetchFriendSaveCount(),
      fetchLocationRequestStatus(),
    ]);
    await Promise.all([fetchSavedState(), fetchRsvpState()]);
    setLoading(false);
  }

  async function fetchUserLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUserCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setUserCoords(null);
    }
  }

  async function fetchEvent() {
    const { data, error } = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        description,
        location,
        start_time,
        cover_image,
        lat,
        lng,
        location_privacy,
        ministry_id,
        event_categories (
          categories ( id, name )
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.log("[event detail error]", error.message);
      setEvent(null);
      return;
    }

    setEvent(data as any);
  }

  async function fetchMoments() {
    const { data, error } = await supabase
      .from("moments")
      .select("id, image_url, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("[moments error]", error.message);
      setMoments([]);
      return;
    }

    setMoments((data ?? []) as any);
  }

  async function fetchSavedState() {
    if (!user?.id || !id) {
      setIsSaved(false);
      return;
    }

    const { data, error } = await supabase
      .from(SAVE_TABLE)
      .select("event_id")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.log("[save state error]", error.message);
      setIsSaved(false);
      return;
    }

    setIsSaved(!!data);
  }

  async function fetchRsvpState() {
    if (!user?.id || !id) {
      setIsRsvped(false);
      return;
    }

    const { data, error } = await supabase
      .from(RSVP_TABLE)
      .select("event_id")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.log("[rsvp state error]", error.message);
      setIsRsvped(false);
      return;
    }

    setIsRsvped(!!data);
  }

  async function fetchFriendSaveCount() {
    if (!user || !id) return;

    // 1. Get friend IDs
    const { data: friendsData, error: friendsError } = await supabase
        .from("friendships")
        .select("user_low, user_high")
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
        .eq("status", "accepted");

    if (friendsError) {
        console.error("[fetchFriendSaveCount] friends error:", friendsError.message);
        return;
    }

    const friendIds = (friendsData || []).map((f: any) => (f.user_low === user.id ? f.user_high : f.user_low));
    if (friendIds.length === 0) return;

    // 2. Get saves for this event made by friends
    const { data: savesData, error: savesError } = await supabase
        .from("event_saves")
        .select("user_id", { count: "exact" })
        .eq("event_id", id)
        .in("user_id", friendIds);

    if (savesError) {
        console.error("[fetchFriendSaveCount] saves error:", savesError.message);
        return;
    }

    setFriendSaveCount(savesData?.length || 0);
  }

  async function fetchLocationRequestStatus() {
    if (!user || !id) return;

    const { data, error } = await supabase
      .from("location_requests")
      .select("status")
      .eq("event_id", id)
      .eq("requester_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[fetchLocationRequestStatus] error:", error.message);
      setLocationRequestStatus("none");
      return;
    }

    setLocationRequestStatus(data?.status ?? "none");
  }

  async function toggleSave() {
    if (!user?.id) {
      Alert.alert("sign in required", "please sign in to save events.");
      router.push("/login" as any);
      return;
    }
    if (busySave) return;

    setBusySave(true);
    try {
      if (isSaved) {
        const { error } = await supabase
          .from(SAVE_TABLE)
          .delete()
          .eq("event_id", id)
          .eq("user_id", user.id);

        if (error) throw new Error(error.message);
        setIsSaved(false);
      } else {
        const { error } = await supabase.from(SAVE_TABLE).insert({
          event_id: id,
          user_id: user.id,
        });

        if (error) throw new Error(error.message);
        setIsSaved(true);
      }
    } catch (e: any) {
      console.log("[toggle save error]", e?.message ?? e);
      Alert.alert("couldn’t update save", e?.message ?? "something went wrong.");
    } finally {
      setBusySave(false);
    }
  }

  async function toggleRsvp() {
    if (!user?.id) {
      Alert.alert("sign in required", "please sign in to rsvp.");
      router.push("/login" as any);
      return;
    }
    if (busyRsvp) return;

    setBusyRsvp(true);
    try {
      if (isRsvped) {
        const { error } = await supabase
          .from(RSVP_TABLE)
          .delete()
          .eq("event_id", id)
          .eq("user_id", user.id);

        if (error) throw new Error(error.message);
        setIsRsvped(false);
      } else {
        const { error } = await supabase.from(RSVP_TABLE).insert({
          event_id: id,
          user_id: user.id,
        });

        if (error) throw new Error(error.message);
        setIsRsvped(true);
      }
    } catch (e: any) {
      console.log("[toggle rsvp error]", e?.message ?? e);
      Alert.alert("couldn’t update rsvp", e?.message ?? "something went wrong.");
    } finally {
      setBusyRsvp(false);
    }
  }

  async function handleRequestLocation() {
    if (!user?.id || !id) {
      Alert.alert("Sign in required", "Please sign in to request location access.");
      router.push("/login" as any);
      return;
    }

    try {
      const { error } = await supabase.from("location_requests").insert({
        event_id: id,
        requester_id: user.id,
        status: "pending",
      });

      if (error) throw new Error(error.message);

      setLocationRequestStatus("pending");
      Alert.alert("Request Sent", "The event host has been notified of your request.");
    } catch (e: any) {
      console.error("[handleRequestLocation] error:", e.message);
      Alert.alert("Error", "Could not send your request. Please try again.");
    }
  }

  async function onShare() {
    if (!event) return;

    // This is the URL that will be shared. It points to our Open Graph endpoint.
    // We will need to replace this with your actual Supabase project URL.
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!.replace('.co', '.in');
    const shareUrl = `${projectUrl}/functions/v1/event-og-tags?id=${id}`;

    try {
      await Share.share({ 
        title: event.title,
        message: shareUrl, // For most apps, the message is the URL itself
        url: shareUrl // For apps that use the url field
      });
    } catch (e) {
      console.log("[share error]", e);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([fetchEvent(), fetchMoments(), fetchUserLocation()]);
    await Promise.all([fetchSavedState(), fetchRsvpState()]);
    setRefreshing(false);
  }

  const categoryNames = useMemo(() => extractCategoryNames(event?.event_categories), [event]);

  if (!id) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
          missing event id.
        </Text>
      </View>
    );
  }

  if (loading && !event) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
          loading event…
        </Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
          event not found.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ✅ header overlay */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.topBtn}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onShare}
          style={styles.topBtn}
        >
          <Ionicons name="share-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={moments}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <Image source={{ uri: item.image_url }} style={styles.moment} />}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 18 }}>
            <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
              no moments yet.
            </Text>
          </View>
        }
        ListHeaderComponent={
          <>
            {/* cover */}
            <View style={[styles.coverWrap, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              {event.cover_image ? (
                <Image source={{ uri: event.cover_image }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverFallback, { backgroundColor: colors.card2 }]}>
                  <Ionicons name="image-outline" size={26} color={colors.muted} />
                  <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>
                    no cover image
                  </Text>
                </View>
              )}
              <View style={styles.coverOverlay} />

              {/* cover text */}
              <View style={styles.coverText}>
                <View style={{ flex: 1 }} />

                <Text style={[styles.title, { fontFamily: fonts.display }]} numberOfLines={2}>
                  {String(event.title ?? "").toLowerCase()}
                </Text>

                <Text style={[styles.meta, { fontFamily: fonts.body }]} numberOfLines={1}>
                  {formatWhen(event.start_time).toLowerCase()}
                </Text>





                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <View style={styles.locationBubble}>
                    {event.location_privacy === "public" || locationRequestStatus === "approved" ? (
                      <Text style={[styles.locationBubbleText, { fontFamily: fonts.body }]} numberOfLines={1}>
                        {(event.location ?? "location tbd").toLowerCase()}
                        {typeof milesAway === "number" ? ` • ${milesAway.toFixed(1)} mi` : ""}
                      </Text>
                    ) : event.location_privacy === "private" ? (
                      <View>
                        {locationRequestStatus === "none" && (
                          <Pressable onPress={handleRequestLocation}>
                            <Text style={[styles.locationBubbleText, { fontFamily: fonts.body }]}>
                              Request Access
                            </Text>
                          </Pressable>
                        )}
                        {locationRequestStatus === "pending" && (
                          <Text style={[styles.locationBubbleText, { fontFamily: fonts.body }]}>
                            Request Pending
                          </Text>
                        )}
                        {locationRequestStatus === "denied" && (
                          <Text style={[styles.locationBubbleText, { fontFamily: fonts.body }]}>
                            Request Denied
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.locationBubbleText, { fontFamily: fonts.body }]} numberOfLines={1}>
                        no physical location
                      </Text>
                    )}
                  </View>
                  {friendSaveCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
                      <Text style={[styles.meta2, { fontFamily: fonts.body }]}>•</Text>
                      <Ionicons name="people" size={12} color={"rgba(255,255,255,0.82)"} style={{ marginLeft: 4, marginRight: 2 }} />
                      <Text style={[styles.meta2, { fontFamily: fonts.body }]}>
                        {friendSaveCount}
                      </Text>
                    </View>
                  )}
                </View>

                {/* tags */}
                {categoryNames.length > 0 ? (
                  <View style={[styles.tagsRow, { marginTop: -12 }]}>
                    {categoryNames.slice(0, 6).map((t) => (
                      <View
                        key={`${event.id}-${t}`}
                        style={[
                          styles.tag,
                          { backgroundColor: "rgba(73,8,176,0.16)", borderColor: "rgba(255,255,255,0.18)" },
                        ]}
                      >
                        <Text style={[styles.tagText, { fontFamily: fonts.strong }]}>
                          {String(t).toLowerCase()}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>







            {/* actions row */}
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <View style={[styles.actionsCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
                <Pressable
                  onPress={toggleRsvp}
                  style={[
                    styles.actionBtn,
                    { borderColor: colors.border },
                    isRsvped ? { backgroundColor: "rgba(73,8,176,0.14)" } : null,
                  ]}
                >
                  <Ionicons
                    name={isRsvped ? "checkmark-circle" : "calendar-outline"}
                    size={18}
                    color={colors.text}
                  />
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.strong }]}>
                    {busyRsvp ? "…" : isRsvped ? "rsvped" : "rsvp"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={toggleSave}
                  style={[
                    styles.actionBtn,
                    { borderColor: colors.border },
                    isSaved ? { backgroundColor: "rgba(73,8,176,0.14)" } : null,
                  ]}
                >
                  <Ionicons
                    name={isSaved ? "bookmark" : "bookmark-outline"}
                    size={18}
                    color={colors.text}
                  />
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.strong }]}>
                    {busySave ? "…" : isSaved ? "saved" : "save"}
                  </Text>
                </Pressable>

                <Pressable onPress={onShare} style={[styles.actionBtn, { borderColor: colors.border }]}>
                  <Ionicons name="share-social-outline" size={18} color={colors.text} />
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.strong }]}>share</Text>
                </Pressable>
              </View>
            </View>

            {/* description + ministry (wired) */}
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              {event.description ? (
                <View style={[styles.bodyCard, { backgroundColor: colors.card2, borderColor: colors.border }]}>
                  <Text style={[styles.bodyTitle, { color: colors.text, fontFamily: fonts.display }]}>about</Text>
                  <Text style={[styles.bodyText, { color: colors.text, fontFamily: fonts.body }]}>
                    {String(event.description).toLowerCase()}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => {
                  if (!event?.ministry_id) {
                    Alert.alert("no ministry linked", "this event isn't linked to a ministry yet.");
                    return;
                  }
                  router.push({ pathname: "/ministry/[id]" as any, params: { id: event.ministry_id } });
                }}
                style={[styles.bodyCard, { backgroundColor: colors.card2, borderColor: colors.border }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={[styles.bodyTitle, { color: colors.text, fontFamily: fonts.display }]}>ministry</Text>
                    <Text style={[styles.bodySub, { color: colors.muted, fontFamily: fonts.body }]}>
                      tap to view church / ministry profile
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </View>
              </Pressable>

              <Text style={[styles.section, { color: colors.text, fontFamily: fonts.display }]}>moments</Text>
            </View>
          </>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
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

  coverWrap: { width: "100%", height: 500, overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.40)" },
    coverText: { ...StyleSheet.absoluteFillObject, padding: 16, justifyContent: "flex-end" },

  title: { color: "#fff", fontSize: 22, fontWeight: "900", textTransform: "lowercase" },
  meta: { color: "rgba(255,255,255,0.86)", marginTop: 8, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
  meta2: { color: "rgba(255,255,255,0.82)", marginTop: 4, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  tag: { height: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tagText: { color: "#fff", fontWeight: "800", fontSize: 12, textTransform: "lowercase" },

  actionsCard: { borderRadius: 18, borderWidth: 1, padding: 10, flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  actionText: { fontWeight: "900", fontSize: 12, textTransform: "lowercase" },

  bodyCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginTop: 12 },
  bodyTitle: { fontSize: 14, fontWeight: "900", textTransform: "lowercase" },
  bodySub: { marginTop: 6, fontSize: 12, fontWeight: "700", textTransform: "lowercase" },
  bodyText: { marginTop: 10, fontSize: 14, lineHeight: 20, fontWeight: "700", textTransform: "lowercase" },

  section: { marginTop: 18, fontSize: 16, fontWeight: "900", textTransform: "lowercase" },

  moment: { width: "92%", alignSelf: "center", height: 240, borderRadius: 18, marginTop: 12 },

  locationBubble: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 99,
    alignSelf: "flex-start",
    marginTop: 24,
  },
  locationBubbleText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "lowercase",
  },
});
