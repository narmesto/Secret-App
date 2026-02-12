// app/(tabs)/home.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
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

type MinistryLite = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  cover_image: string | null;
  lat?: number | null;
  lng?: number | null;
  event_categories?: any[] | null;
  categories: string[];

  ministry_id?: string | null;
  ministries?: MinistryLite | null;
};

type Suggestion = {
  label: string; // what user sees + what gets placed in search
  type: "event" | "category" | "location" | "ministry";
  eventId?: string;
};

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

function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((r) => [keyFn(r), r])).values());
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

function initialsAvatar(seed: string) {
  return "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(seed);
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

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function normalize(s: string) {
  return (s ?? "").trim().toLowerCase();
}

// ✅ "closest relevant suggestion" scoring
function scoreMatch(queryRaw: string, candidateRaw: string) {
  const q = normalize(queryRaw);
  const c = normalize(candidateRaw);

  if (!q || !c) return null;

  // exact
  if (c === q) return 0;

  // starts-with
  if (c.startsWith(q)) return 10 + (c.length - q.length);

  // any word starts with q
  const words = c.split(/[\s\-_/]+/g);
  if (words.some((w) => w.startsWith(q))) return 25 + (c.length - q.length);

  // includes (earlier index is better)
  const idx = c.indexOf(q);
  if (idx >= 0) return 60 + idx + (c.length - q.length) * 0.25;

  return null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState<string>("");

  // ✅ suggestions UI state
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // saves
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveBusy, setSaveBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function init() {
    setLoading(true);
    await Promise.all([fetchEvents(), fetchUserLocation(), fetchSaved()]);
    setLoading(false);
  }

  async function fetchUserLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationDenied(true);
        setUserCoords(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationDenied(false);
    } catch {
      setUserCoords(null);
    }
  }

  async function fetchEvents() {
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
        ministry_id,
        event_categories (
          categories ( id, name )
        )
      `
      )
      .order("start_time", { ascending: true });

    if (error) {
      console.log("[home events error]", error.message);
      setEvents([]);
      return;
    }

    const cleaned: EventRow[] = (data ?? []).map((e: any) => ({
      id: String(e.id),
      title: String(e.title ?? ""),
      description: e.description ?? null,
      location: e.location ?? null,
      start_time: String(e.start_time),
      cover_image: e.cover_image ?? null,
      lat: e.lat ?? null,
      lng: e.lng ?? null,
      event_categories: e.event_categories ?? null,
      categories: extractCategoryNames(e.event_categories).map((x) => x.toLowerCase()),
      ministry_id: e.ministry_id ?? null,
      ministries: null,
    }));

    // Optional: attach ministries (no FK required)
    const ministryIds = Array.from(
      new Set(cleaned.map((e) => e.ministry_id).filter((x): x is string => !!x))
    );

    if (ministryIds.length > 0) {
      const { data: mins, error: minsErr } = await supabase
        .from("ministries")
        .select("id, name, avatar_url")
        .in("id", ministryIds);

      if (minsErr) {
        console.log("[home ministries fetch error]", minsErr.message);
      } else {
        const byId = new Map<string, MinistryLite>();
        (mins ?? []).forEach((m: any) => {
          byId.set(String(m.id), {
            id: String(m.id),
            name: m.name ?? null,
            avatar_url: m.avatar_url ?? null,
          });
        });
        for (const e of cleaned) {
          if (e.ministry_id && byId.has(e.ministry_id)) e.ministries = byId.get(e.ministry_id)!;
        }
      }
    }

    setEvents(dedupeByKey(cleaned, (x) => x.id));
  }

  async function fetchSaved() {
    if (!user?.id) {
      setSavedIds(new Set());
      return;
    }

    const { data, error } = await supabase
      .from("event_saves")
      .select("event_id")
      .eq("user_id", user.id);

    if (error) {
      console.log("[home saved fetch error]", error.message);
      return;
    }

    const next = new Set<string>((data ?? []).map((r: any) => String(r.event_id)));
    setSavedIds(next);
  }

  // ✅ build suggestion candidates + rank them
  const suggestions = useMemo(() => {
    const q = searchText.trim();
    if (q.length < 1) return [];

    // collect candidate suggestions
    const pool: Suggestion[] = [];

    for (const e of events) {
      // event title suggestions
      if (e.title) pool.push({ label: e.title, type: "event", eventId: e.id });

      // location suggestions
      if (e.location) pool.push({ label: e.location, type: "location" });

      // category suggestions
      for (const c of e.categories ?? []) {
        if (c) pool.push({ label: c, type: "category" });
      }

      // ministry name suggestions
      const mn = e.ministries?.name ?? null;
      if (mn) pool.push({ label: String(mn), type: "ministry" });
    }

    // dedupe by lowercase label + type (so "worship" doesn't appear 20x)
    const seen = new Set<string>();
    const deduped = pool.filter((s) => {
      const key = `${s.type}:${normalize(s.label)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const ranked = deduped
      .map((s) => {
        const sc = scoreMatch(q, s.label);
        return sc == null ? null : { s, sc };
      })
      .filter((x): x is { s: Suggestion; sc: number } => !!x)
      .sort((a, b) => a.sc - b.sc)
      .slice(0, 6)
      .map((x) => x.s);

    return ranked;
  }, [searchText, events]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return events;

    return events.filter((e) => {
      const hay = [
        e.title,
        e.location ?? "",
        e.description ?? "",
        ...(e.categories ?? []),
        e.ministries?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [events, searchText]);

  const now = Date.now();
  const today = useMemo(() => new Date(), []);

  const spotlightEvents = useMemo(() => {
    return filtered.filter((e) => new Date(e.start_time).getTime() >= now).slice(0, 25);
  }, [filtered, now]);

  const startingSoon = useMemo(() => {
    return filtered
      .filter((e) => {
        const dt = new Date(e.start_time);
        const t = dt.getTime();
        return isSameLocalDay(dt, today) && t >= now;
      })
      .slice(0, 20);
  }, [filtered, today, now]);

  const nearYou = useMemo(() => {
    const withCoords = filtered.filter((e) => typeof e.lat === "number" && typeof e.lng === "number");

    if (!userCoords) return (withCoords.length ? withCoords : filtered).slice(0, 10);

    const within = withCoords
      .map((e) => {
        const dist = milesBetween(userCoords.lat, userCoords.lng, Number(e.lat), Number(e.lng));
        return { e, dist };
      })
      .filter((x) => x.dist <= 25)
      .sort((a, b) => a.dist - b.dist)
      .map((x) => x.e);

    return within.slice(0, 10);
  }, [filtered, userCoords]);

  async function toggleSave(eventId: string) {
    if (!user?.id) {
      Alert.alert("sign in required", "sign in to save events.");
      router.replace("/login" as any);
      return;
    }

    setSaveBusy((prev) => new Set(prev).add(eventId));
    const isSaved = savedIds.has(eventId);

    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(eventId);
      else next.add(eventId);
      return next;
    });

    try {
      if (isSaved) {
        const { error } = await supabase
          .from("event_saves")
          .delete()
          .eq("user_id", user.id)
          .eq("event_id", eventId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_saves").insert({
          user_id: user.id,
          event_id: eventId,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(eventId);
        else next.delete(eventId);
        return next;
      });
      Alert.alert("save failed", e?.message ?? "something went wrong");
    } finally {
      setSaveBusy((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  }

  function iconForSuggestionType(t: Suggestion["type"]) {
    if (t === "event") return "calendar-outline";
    if (t === "category") return "pricetag-outline";
    if (t === "location") return "location-outline";
    return "people-outline"; // ministry
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* tiny header: no bar */}
        <View style={styles.miniHeader}>
          <View style={{ width: 34, height: 34 }} />
          <Text style={[styles.miniHeaderTitle, { color: colors.text, fontFamily: fonts.display }]}>
            gather
          </Text>
          <Pressable
            style={[styles.miniHeaderBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
            onPress={init}
          >
            <Ionicons name="refresh" size={16} color={isDark ? "#fff" : colors.text} />
          </Pressable>
        </View>

        {/* ✅ Search bar */}
        <View style={[styles.searchWrap, { backgroundColor: colors.card2, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={searchText}
            onChangeText={(t) => {
              setSearchText(t);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="search gatherings…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text, fontFamily: fonts.body }]}
          />
          {searchText.trim().length > 0 ? (
            <Pressable
              onPress={() => {
                setSearchText("");
                setShowSuggestions(false);
              }}
              hitSlop={10}
              style={{ padding: 6 }}
            >
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* ✅ Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 ? (
          <View style={[styles.suggestBox, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            {suggestions.map((s, idx) => (
              <Pressable
                key={`sg-${s.type}-${normalize(s.label)}-${idx}`}
                onPress={() => {
                  // If suggestion is an event title and we have id, you can either:
                  // A) set search to title (current behavior), or
                  // B) jump straight to event page (commented).
                  setSearchText(String(s.label));
                  setShowSuggestions(false);

                  // Option B:
                  // if (s.type === "event" && s.eventId) router.push(`/event/${String(s.eventId).trim()}` as any);
                }}
                style={[
                  styles.suggestRow,
                  idx === suggestions.length - 1 ? { borderBottomWidth: 0 } : null,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Ionicons name={iconForSuggestionType(s.type) as any} size={16} color={colors.muted} />
                <Text style={[styles.suggestText, { color: colors.text, fontFamily: fonts.strong }]} numberOfLines={1}>
                  {String(s.label).toLowerCase()}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={[styles.suggestType, { color: colors.muted, fontFamily: fonts.body }]}>
                  {s.type}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {locationDenied ? (
          <Text style={[styles.helper, { color: colors.muted, fontFamily: fonts.body }]}>
            location is off — near you will be approximate.
          </Text>
        ) : null}

        {/* STARTING TODAY */}
        {/* STARTING TODAY (only show if there are events today) */}
{!loading && startingSoon.length > 0 ? (
  <>
    <SectionHeader title="starting today" colors={colors} fonts={fonts} />

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselRow}>
      {startingSoon.map((e) => (
        <Pressable
          key={`today-${e.id}`}
          style={[styles.todayCard, { backgroundColor: colors.card2, borderColor: colors.border }]}
          onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
        >
          <Image source={{ uri: e.cover_image || initialsAvatar(e.title) }} style={styles.todayAvatar} />

          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
              {e.title.toLowerCase()}
            </Text>
            <Text style={[styles.rowSubtitle, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
              {formatWhen(e.start_time).toLowerCase()}
            </Text>
            <Text style={[styles.rowSubtitle, { color: colors.muted, fontFamily: fonts.body }]} numberOfLines={1}>
              {(e.location ?? "location tbd").toLowerCase()}
            </Text>
          </View>

          <View style={[styles.soonPill, { backgroundColor: "rgba(73,8,176,0.10)", borderColor: colors.border }]}>
            <Text style={[styles.soonText, { color: colors.text, fontFamily: fonts.strong }]}>today</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  </>
) : null}


        {/* SPOTLIGHT */}
        <SectionHeader title="spotlight" subtitle="all upcoming gatherings" colors={colors} fonts={fonts} />

        {loading ? (
          <LoadingBubble colors={colors} fonts={fonts} />
        ) : spotlightEvents.length > 0 ? (
          <View style={{ gap: 12 }}>
            {spotlightEvents.map((e) => (
              <EventImageCard
                key={`spot-${e.id}`}
                variant="large"
                event={e}
                colors={colors}
                fonts={fonts}
                saved={savedIds.has(e.id)}
                saving={saveBusy.has(e.id)}
                onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
                onToggleSave={() => toggleSave(e.id)}
              />
            ))}
          </View>
        ) : (
          <EmptyBubble colors={colors} fonts={fonts} text="no gatherings yet." />
        )}

        <SectionHeader
          title="near you"
          subtitle={userCoords ? "within 25 miles" : "nearby (enable location for radius)"}
          colors={colors}
          fonts={fonts}
        />

        {loading ? (
          <LoadingBubble colors={colors} fonts={fonts} />
        ) : nearYou.length === 0 ? (
          <EmptyBubble colors={colors} fonts={fonts} text="no gatherings found within 25 miles." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselRow}>
            {nearYou.map((e) => (
              <EventImageCard
                key={`near-${e.id}`}
                variant="small"
                event={e}
                colors={colors}
                fonts={fonts}
                saved={savedIds.has(e.id)}
                saving={saveBusy.has(e.id)}
                onPress={() => router.push(`/event/${String(e.id).trim()}` as any)}
                onToggleSave={() => toggleSave(e.id)}
              />
            ))}
          </ScrollView>
        )}

        <SectionHeader title="explore" subtitle="choose a lane" colors={colors} fonts={fonts} />

        <View style={styles.grid}>
          <ExploreTile
            icon="musical-notes-outline"
            label="worship nights"
            hint="big sound. big presence."
            onPress={() => {
              setSearchText("worship");
              setShowSuggestions(false);
            }}
            colors={colors}
            fonts={fonts}
          />
          <ExploreTile
            icon="people-outline"
            label="community"
            hint="fellowship + food."
            onPress={() => {
              setSearchText("community");
              setShowSuggestions(false);
            }}
            colors={colors}
            fonts={fonts}
          />
          <ExploreTile
            icon="book-outline"
            label="bible study"
            hint="go deeper together."
            onPress={() => {
              setSearchText("bible");
              setShowSuggestions(false);
            }}
            colors={colors}
            fonts={fonts}
          />
          <ExploreTile
            icon="heart-outline"
            label="serve"
            hint="find ways to help."
            onPress={() => {
              setSearchText("serve");
              setShowSuggestions(false);
            }}
            colors={colors}
            fonts={fonts}
          />
        </View>

        <View style={{ height: 18 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- ui helpers ---------- */

function SectionHeader({
  title,
  subtitle,
  colors,
  fonts,
}: {
  title: string;
  subtitle?: string;
  colors: any;
  fonts: any;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.display }]}>
          {title.toLowerCase()}
        </Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, { color: colors.muted, fontFamily: fonts.body }]}>
            {subtitle.toLowerCase()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LoadingBubble({ colors, fonts }: { colors: any; fonts: any }) {
  return (
    <View style={[styles.loadingBubble, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <ActivityIndicator />
      <Text style={[styles.loadingText, { color: colors.muted, fontFamily: fonts.strong }]}>loading…</Text>
    </View>
  );
}

function EmptyBubble({ colors, fonts, text }: { colors: any; fonts: any; text: string }) {
  return (
    <View style={[styles.emptyBubble, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      <Ionicons name="sparkles-outline" size={18} color="rgba(120,120,130,0.9)" />
      <Text style={[styles.emptyText, { color: colors.muted, fontFamily: fonts.body }]}>{text.toLowerCase()}</Text>
    </View>
  );
}

function ExploreTile({
  icon,
  label,
  hint,
  onPress,
  colors,
  fonts,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  colors: any;
  fonts: any;
}) {
  return (
    <Pressable style={[styles.gridTile, { backgroundColor: colors.card2, borderColor: colors.border }]} onPress={onPress}>
      <View style={[styles.gridIcon, { borderColor: colors.border }]}>
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>

      <Text style={[styles.tileHeading, { color: colors.text, fontFamily: fonts.display }]}>{label.toLowerCase()}</Text>
      <Text style={[styles.gridHint, { color: colors.muted, fontFamily: fonts.body }]}>{hint.toLowerCase()}</Text>

      <View style={styles.tileAccentRow}>
        <View style={[styles.tileAccent, { backgroundColor: "rgba(73,8,176,0.55)" }]} />
        <View style={[styles.tileAccent, { backgroundColor: "rgba(73,8,176,0.22)" }]} />
        <View style={[styles.tileAccent, { backgroundColor: "rgba(73,8,176,0.12)" }]} />
      </View>
    </Pressable>
  );
}

function EventImageCard({
  event,
  variant,
  colors,
  fonts,
  onPress,
  onToggleSave,
  saved,
  saving,
}: {
  event: EventRow;
  variant: "large" | "small";
  colors: any;
  fonts: any;
  onPress: () => void;
  onToggleSave: () => void;
  saved: boolean;
  saving: boolean;
}) {
  const height = variant === "large" ? 210 : 190;
  const width = variant === "large" ? "100%" : 270;

  return (
    <Pressable
      style={[
        styles.imageCard,
        { height, width: width as any, backgroundColor: colors.card2, borderColor: colors.border },
      ]}
      onPress={onPress}
    >
      <Image source={{ uri: event.cover_image || initialsAvatar(event.title) }} style={StyleSheet.absoluteFill} />
      <View style={styles.imageOverlay} />

      <View style={styles.imageCardContent}>
        <Text style={[styles.imageCardTitle, { fontFamily: fonts.display }]} numberOfLines={1}>
          {event.title.toLowerCase()}
        </Text>

        <Text style={[styles.imageCardMeta, { fontFamily: fonts.body }]} numberOfLines={1}>
          {formatWhen(event.start_time).toLowerCase()}
          {event.location ? ` • ${event.location.toLowerCase()}` : " • location tbd"}
        </Text>

        <View style={styles.imageCardActions}>
          <View
            style={[
              styles.softPill,
              { backgroundColor: "rgba(73,8,176,0.16)", borderColor: "rgba(255,255,255,0.18)" },
            ]}
          >
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={[styles.softPillText, { fontFamily: fonts.strong }]}>gathering</Text>
          </View>

          <View style={{ flex: 1 }} />

          <Pressable
            hitSlop={10}
            style={[
              styles.iconBtnSquare,
              {
                backgroundColor: "rgba(255,255,255,0.10)",
                borderColor: "rgba(255,255,255,0.18)",
                opacity: saving ? 0.6 : 1,
              },
            ]}
            onPress={(evt: any) => {
              evt?.stopPropagation?.();
              onToggleSave();
            }}
            disabled={saving}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  miniHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  miniHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "lowercase",
  },
  miniHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    textTransform: "lowercase",
  },

  // ✅ suggestions dropdown
  suggestBox: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
  },
  suggestRow: {
    paddingHorizontal: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
  },
  suggestText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "lowercase",
    maxWidth: "70%",
  },
  suggestType: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "lowercase",
  },

  helper: { marginTop: 6, fontSize: 12, lineHeight: 16, fontWeight: "600" },

  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, letterSpacing: 0.4, fontWeight: "700", textTransform: "lowercase" },
  sectionSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "600", textTransform: "lowercase" },

  carouselRow: { paddingRight: 12, gap: 12 },

  todayCard: {
    width: 320,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  todayAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#111" },

  imageCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  imageCardContent: {
    flex: 1,
    padding: 14,
    justifyContent: "flex-end",
  },

  imageCardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },
  imageCardMeta: {
    color: "rgba(255,255,255,0.82)",
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
  },

  imageCardActions: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },

  softPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  softPillText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.2, textTransform: "lowercase" },

  iconBtnSquare: {
    width: 44,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  rowTitle: { fontSize: 15, fontWeight: "800", letterSpacing: 0.15, textTransform: "lowercase" },
  rowSubtitle: { fontWeight: "600", fontSize: 12, marginTop: 2, textTransform: "lowercase" },

  soonPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  soonText: { fontWeight: "800", fontSize: 11, letterSpacing: 0.2, textTransform: "lowercase" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridTile: { width: "48%", borderRadius: 18, padding: 14, borderWidth: 1, overflow: "hidden" },
  gridIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(20,20,26,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tileHeading: { letterSpacing: 0.2, marginTop: 10, fontSize: 14, fontWeight: "800", textTransform: "lowercase" },
  gridHint: { fontWeight: "600", fontSize: 12, marginTop: 4, lineHeight: 16, textTransform: "lowercase" },

  tileAccentRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  tileAccent: { flex: 1, height: 3, borderRadius: 999 },

  loadingBubble: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  loadingText: { fontWeight: "700", textTransform: "lowercase" },

  emptyBubble: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  emptyText: { fontWeight: "600", flex: 1, lineHeight: 18, textTransform: "lowercase" },
});
