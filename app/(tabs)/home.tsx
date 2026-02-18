import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { EmptyBubble, LoadingBubble } from "../../components/home/Bubbles";
import { EventImageCard } from "../../components/home/EventImageCard";
import { ExploreTile } from "../../components/home/ExploreTile";
import { SectionHeader } from "../../components/home/SectionHeader";
import Slider from "@react-native-community/slider";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";
import { EventRow } from "../../types";
import { dedupeByKey } from "../../utils/array";
import { milesBetween } from "../../utils/geo";
import { scoreMatch } from "../../utils/search";
import { normalize } from "../../utils/string";
import { isSameLocalDay } from "../../utils/time";

type Suggestion = {
  label: string;
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

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors, fonts } = useTheme();
  const navigation = useNavigation();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const [showFilterModal, setShowFilterModal] = useState(false);

  // Temporary state for the modal
  const [tempFilterRadius, setTempFilterRadius] = useState(Infinity);
    const [tempFilterCategories, setTempFilterCategories] = useState<string[]>([]);

    // Applied filter state
    const [appliedFilterRadius, setAppliedFilterRadius] = useState(Infinity);
  const [appliedFilterCategories, setAppliedFilterCategories] = useState<string[]>([]);

  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);
    const [friendSaveCounts, setFriendSaveCounts] = useState<Record<string, number>>({});

    const fetchFriendSaveCounts = useCallback(async (eventIds: string[]) => {
        if (!user || eventIds.length === 0) return;

        // 1. Get friend IDs
        const { data: friendsData, error: friendsError } = await supabase
            .from("friendships")
            .select("user_low, user_high")
            .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
            .eq("status", "accepted");

        if (friendsError) {
            console.error("[fetchFriendSaveCounts] friends error:", friendsError.message);
            return;
        }

        const friendIds = (friendsData || []).map((f: any) => (f.user_low === user.id ? f.user_high : f.user_low));
        if (friendIds.length === 0) return;

        // 2. Get saves for the given events made by friends
        const { data: savesData, error: savesError } = await supabase
            .from("event_saves")
            .select("event_id, user_id")
            .in("user_id", friendIds)
            .in("event_id", eventIds);

        if (savesError) {
            console.error("[fetchFriendSaveCounts] saves error:", savesError.message);
            return;
        }

        // 3. Count saves per event
        const counts = (savesData || []).reduce((acc, save) => {
            if (!acc[save.event_id]) {
                acc[save.event_id] = 0;
            }
            acc[save.event_id]++;
            return acc;
        }, {} as Record<string, number>);

        setFriendSaveCounts(counts);
    }, [user]);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveBusy, setSaveBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    fetchSaved();
  }, [user?.id]);

  async function init() {
    setLoading(true);
    await Promise.all([fetchEvents(), fetchUserLocation(), fetchSaved(), fetchCategories()]);
    setLoading(false);
  }

  async function fetchCategories() {
    const { data, error } = await supabase.from("categories").select("id, name").order("name");
    if (error) {
      console.log("[home categories error]", error.message);
      setAllCategories([]);
      return;
    }
    setAllCategories(data ?? []);
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
        owner_id,
        ministry_id,
        event_categories (
          categories ( id, name )
        ),
        ministries (id, name)
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
      owner_id: e.owner_id ?? null,
      event_categories: e.event_categories ?? null,
      categories: extractCategoryNames(e.event_categories).map((x) => x.toLowerCase()),
      ministry_id: e.ministry_id ?? null,
      ministries: e.ministries ?? null,
    }));

    setEvents(dedupeByKey(cleaned, (x) => x.id));
    // After fetching events, fetch the friend save counts for them
    if (data) {
      fetchFriendSaveCounts(data.map((e: any) => e.id));
    }
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

  const suggestions = useMemo(() => {
    const q = searchText.trim();
    if (q.length < 1) return [];

    const pool: Suggestion[] = [];

    for (const e of events) {
      if (e.title) pool.push({ label: e.title, type: "event", eventId: e.id });
      if (e.location) pool.push({ label: e.location, type: "location" });
      for (const c of e.categories ?? []) {
        if (c) pool.push({ label: c, type: "category" });
      }
      const mn = e.ministries?.name ?? null;
      if (mn) pool.push({ label: String(mn), type: "ministry" });
    }

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

  const filteredEvents = useMemo(() => {
    let filtered = events;

    // 1. Radius
    if (userCoords) {
      filtered = filtered.filter((e) => {
        if (typeof e.lat !== "number" || typeof e.lng !== "number") return false;
        if (appliedFilterRadius === Infinity) return true;
        const dist = milesBetween(userCoords.lat, userCoords.lng, e.lat, e.lng);
        return dist <= appliedFilterRadius;
      });
    }

    // 2. Categories
    if (appliedFilterCategories.length > 0) {
      const selected = new Set(appliedFilterCategories);
      filtered = filtered.filter((e) => {
        const eventCats = e.event_categories?.map((ec: any) => ec.categories?.id).filter(Boolean) ?? [];
        return eventCats.some((catId: string) => selected.has(catId));
      });
    }

    return filtered;
  }, [events, userCoords, appliedFilterRadius, appliedFilterCategories]);

  const filteredBySearch = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return filteredEvents;

    return filteredEvents.filter((e) => {
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

  const myEvents = useMemo(() => {
    if (!user?.id) return [];
    return filteredEvents.filter((e) => e.owner_id === user.id).slice(0, 25);
  }, [filteredEvents, user?.id]);

  const spotlightEvents = useMemo(() => {
    return filteredEvents.filter((e) => new Date(e.start_time).getTime() >= now).slice(0, 25);
  }, [filteredEvents, now]);

  const startingSoon = useMemo(() => {
    return filteredEvents
      .filter((e) => {
        const dt = new Date(e.start_time);
        const t = dt.getTime();
        return isSameLocalDay(dt, today) && t >= now;
      })
      .slice(0, 20);
  }, [filteredEvents, today, now]);


  async function toggleSave(eventId: string) {
    if (!user?.id) {
      Alert.alert("sign in required", "sign in to save events.");
      router.replace("/login");
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
    return "people-outline";
  }

  function handleOpenFilterModal() {
    setTempFilterRadius(appliedFilterRadius);
    setTempFilterCategories(appliedFilterCategories);
    setShowFilterModal(true);
  }

  function handleApplyFilters() {
    setAppliedFilterRadius(tempFilterRadius);
    setAppliedFilterCategories(tempFilterCategories);
    setShowFilterModal(false);
  }

  useEffect(() => {
        navigation.setOptions({
            headerTitle: "gather",
            headerLeft: () => (
                <Pressable onPress={handleOpenFilterModal} style={{ marginLeft: 12 }}>
                    <Ionicons name="options-outline" size={24} color={colors.primary} />
                </Pressable>
            ),
            headerRight: () => (
                <Pressable onPress={init} style={{ marginRight: 12 }}>
                    <Ionicons name="refresh" size={24} color={colors.primary} />
                </Pressable>
            ),
        });
    }, [navigation, colors, init, appliedFilterRadius, appliedFilterCategories]);

  const radiusOptions = [5, 10, 25, 50, 100, Infinity];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={searchText}
            onChangeText={(t) => {
              setSearchText(t);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search gatherings..."
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

        {showSuggestions && suggestions.length > 0 ? (
          <View style={[styles.suggestBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {suggestions.map((s, idx) => (
              <Pressable
                key={`sg-${s.type}-${normalize(s.label)}-${idx}`}
                onPress={() => {
                  setSearchText(String(s.label));
                  setShowSuggestions(false);
                }}
                style={[
                  styles.suggestRow,
                  idx === suggestions.length - 1 ? { borderBottomWidth: 0 } : null,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Ionicons name={iconForSuggestionType(s.type)} size={16} color={colors.muted} />
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
            Location is off — "near you" will be approximate.
          </Text>
        ) : null}

        {!loading && myEvents.length > 0 ? (
          <>
            <SectionHeader title="My Events" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
            >
              {myEvents.map((e) => (
                <EventImageCard
                  key={`my-event-${e.id}`}
                  variant="small"
                  event={e}
                  saved={savedIds.has(e.id)}
                  saving={saveBusy.has(e.id)}
                  onPress={() => router.push(`/event/${e.id}`)}
                  onToggleSave={() => toggleSave(e.id)}
                  friendSaveCount={friendSaveCounts[e.id] || 0}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {!loading && startingSoon.length > 0 ? (
          <>
            <SectionHeader title="Starting Today" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
            >
              {startingSoon.map((e) => (
                <EventImageCard
                  key={`today-${e.id}`}
                  variant="small"
                  event={e}
                  saved={savedIds.has(e.id)}
                  saving={saveBusy.has(e.id)}
                  onPress={() => router.push(`/event/${e.id}`)}
                  onToggleSave={() => toggleSave(e.id)}
                  friendSaveCount={friendSaveCounts[e.id] || 0}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionHeader title="Spotlight" subtitle="All upcoming gatherings" />

        {loading ? (
          <LoadingBubble />
        ) : spotlightEvents.length > 0 ? (
          <View style={{ gap: 12 }}>
            {spotlightEvents.map((e) => (
              <EventImageCard
                key={`spot-${e.id}`}
                variant="large"
                event={e}
                saved={savedIds.has(e.id)}
                saving={saveBusy.has(e.id)}
                onPress={() => router.push(`/event/${e.id}`)}
                onToggleSave={() => toggleSave(e.id)}
                friendSaveCount={friendSaveCounts[e.id] || 0}
              />
            ))}
          </View>
        ) : (
          <EmptyBubble text="No gatherings yet." />
        )}
      </ScrollView>

      <Modal visible={showFilterModal} transparent animationType="slide">
        <Pressable onPress={() => setShowFilterModal(false)} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text, marginBottom: 24 }}>
              Filter Gatherings
            </Text>

            <Text style={{ fontFamily: fonts.strong, fontSize: 16, color: colors.text, marginBottom: 12 }}>
              Search Radius
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {radiusOptions.map((r) => {
                const isSelected = tempFilterRadius === r;
                const label = r === Infinity ? "Infinite" : `${r} mi`;
                return (
                  <Pressable
                    key={`radius-${r}`}
                    onPress={() => setTempFilterRadius(r)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 14,
                        color: isSelected ? "#fff" : colors.text,
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ fontFamily: fonts.strong, fontSize: 16, color: colors.text, marginTop: 24, marginBottom: 12 }}>
              Categories
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {allCategories.map((c) => {
                const isSelected = tempFilterCategories.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setTempFilterCategories((prev) =>
                        isSelected ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      );
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      borderWidth: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 14,
                        color: isSelected ? "#fff" : colors.text,
                      }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleApplyFilters}
              style={{ marginTop: 32, backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ fontFamily: fonts.strong, fontSize: 16, color: "#fff" }}>Apply Filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    marginHorizontal: 24,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    height: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  suggestBox: {
    marginHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  suggestText: {
    fontSize: 14,
    marginLeft: 12,
  },
  suggestType: {
    fontSize: 12,
    textTransform: "uppercase",
  },
  helper: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 13,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 24,
    gap: 12,
  },
});
