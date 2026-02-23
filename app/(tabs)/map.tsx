// app/(tabs)/map.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";
import { useRouter } from "expo-router";

type Category = { id: string; name: string };

type EventPin = {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
  lat: number;
  lng: number;
  cover_image?: string | null;
  categories: string[];
};

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b0b0b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b0b0b" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#141414" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050505" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
];

const LIGHT_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
];

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

export default function MapScreen() {
  const router = useRouter();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const mapRef = useRef<MapView>(null);

  const [pins, setPins] = useState<EventPin[]>([]);
  const [loading, setLoading] = useState(true);

  const [locationDenied, setLocationDenied] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);

  // Search
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EventPin[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Device compass heading
  const [deviceHeading, setDeviceHeading] = useState(0);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);

  // Categories
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [activeCategoryIds, setActiveCategoryIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    init();

    return () => {
      headingSubRef.current?.remove();
      headingSubRef.current = null;
    };
  }, []);

  async function init() {
    setLoading(true);

    await fetchCategories();

    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      setLocationDenied(true);
      setRegion({
        latitude: 37.773972,
        longitude: -122.431297,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      });
    } else {
      const pos = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });

      headingSubRef.current?.remove();
      headingSubRef.current = await Location.watchHeadingAsync((h) => {
        const raw = (h.trueHeading ?? -1) >= 0 ? h.trueHeading : h.magHeading;
        const normalized = ((raw % 360) + 360) % 360;
        setDeviceHeading(normalized);
      });
    }

    await fetchPins();
    setLoading(false);
  }

  async function fetchCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.log("[categories error]", error.message);
      setAllCategories([]);
      return;
    }

    const cleaned: Category[] = (data ?? []).map((c: any, idx: number) => {
      const idRaw = c?.id;
      const nameRaw = c?.name;

      const id = idRaw === null || idRaw === undefined ? "" : String(idRaw);
      const name = nameRaw === null || nameRaw === undefined ? "" : String(nameRaw);

      const safeId = id || (name ? `name:${name}` : `row:${idx}`);
      return { id: safeId, name: (name || "untitled").toLowerCase() };
    });

    setAllCategories(dedupeByKey(cleaned, (c) => c.id));
  }

  async function fetchPins() {
    const { data, error } = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        start_time,
        location,
        lat,
        lng,
        cover_image,
        event_categories (
          categories ( id, name )
        )
      `
      )
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("start_time", { ascending: true });

    if (error) {
      console.log("[map pins error]", error.message);
      setPins([]);
      return;
    }

    const cleaned: EventPin[] = (data ?? [])
      .filter((e: any) => typeof e.lat === "number" && typeof e.lng === "number")
      .map((e: any) => ({
        id: String(e.id),
        title: String(e.title ?? ""),
        start_time: String(e.start_time),
        location: e.location ?? null,
        lat: Number(e.lat),
        lng: Number(e.lng),
        cover_image: e.cover_image ?? null,
        categories: extractCategoryNames(e.event_categories).map((x) => x.toLowerCase()),
      }));

    setPins(dedupeByKey(cleaned, (e) => e.id));
  }

  async function recenterOnUser() {
    try {
      const pos = await Location.getCurrentPositionAsync({});
      Keyboard.dismiss();
      setSearchOpen(false);

      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        600
      );
    } catch {
      console.log("could not recenter map");
    }
  }

  function resetNorth() {
    mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 450 });
  }

  function openSearch() {
    setSearchOpen(true);
  }

  function clearSearch() {
    setQuery("");
    setSearchResults([]);
    setSearchOpen(false);
    Keyboard.dismiss();
  }

  async function runSearch(text: string) {
    const q = text.trim();
    setQuery(text);

    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);

    const { data, error } = await supabase
      .from("events")
      .select(
        `
        id,
        title,
        start_time,
        location,
        lat,
        lng,
        cover_image,
        event_categories (
          categories ( id, name )
        )
      `
      )
      .not("lat", "is", null)
      .not("lng", "is", null)
      .or(`title.ilike.%${q}%,location.ilike.%${q}%`)
      .order("start_time", { ascending: true })
      .limit(10);

    setSearchLoading(false);

    if (error) {
      console.log("[search error]", error.message);
      setSearchResults([]);
      return;
    }

    const cleaned: EventPin[] = (data ?? [])
      .filter((e: any) => typeof e.lat === "number" && typeof e.lng === "number")
      .map((e: any) => ({
        id: String(e.id),
        title: String(e.title ?? ""),
        start_time: String(e.start_time),
        location: e.location ?? null,
        lat: Number(e.lat),
        lng: Number(e.lng),
        cover_image: e.cover_image ?? null,
        categories: extractCategoryNames(e.event_categories).map((x) => x.toLowerCase()),
      }));

    setSearchResults(dedupeByKey(cleaned, (e) => e.id));
  }

  function focusEvent(e: EventPin) {
    Keyboard.dismiss();
    setSearchOpen(false);

    mapRef.current?.animateToRegion(
      { latitude: e.lat, longitude: e.lng, latitudeDelta: 0.035, longitudeDelta: 0.035 },
      650
    );
  }

  function toggleCategory(id: string) {
    setActiveCategoryIds((prev) => {
      if (prev.size === 0) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setActiveCategoryIds(new Set());
  }

  const categoryIdToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.id, c.name);
    return m;
  }, [allCategories]);

  const activeCategoryNames = useMemo(() => {
    if (activeCategoryIds.size === 0) return null;
    const names: string[] = [];
    activeCategoryIds.forEach((id) => {
      const n = categoryIdToName.get(id);
      if (n) names.push(n);
    });
    return names;
  }, [activeCategoryIds, categoryIdToName]);

  const filteredPins = useMemo(() => {
    if (!activeCategoryNames || activeCategoryNames.length === 0) return pins;
    return pins.filter((p) => p.categories.some((n) => activeCategoryNames.includes(n)));
  }, [pins, activeCategoryNames]);

  const ready = useMemo(() => region !== null, [region]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
        <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.strong }]}>loading map…</Text>
      </View>
    );
  }

  /**
   * Tweaks requested:
   * - LIGHT MODE overlays more transparent
   * - Active chips: lighter lavender (not dark purple)
   */
  const surface = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.58)";
  const surfaceStrong = isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.68)";
  const chipSurface = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.52)";

  const border = isDark ? "rgba(255,255,255,0.18)" : "rgba(20,20,26,0.10)";
  const text = isDark ? "#fff" : colors.text;
  const placeholder = isDark ? "rgba(255,255,255,0.58)" : "rgba(20,20,26,0.45)";

  const activeChipFill = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const activeChipBorder = isDark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.16)";

  const activeChipText = isDark ? "#000" : "#fff";

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region || undefined}
        customMapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
        showsUserLocation={!locationDenied}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled
        pitchEnabled
        onPress={() => {
          setSearchOpen(false);
          Keyboard.dismiss();
        }}
        onRegionChangeComplete={(r) => setRegion(r)}
      >
        {filteredPins.map((p) => (
          <Marker
            key={`event-${p.id}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            onPress={() => {
              router.push(`/event/${p.id}`);
            }}
          >
            <EventBubbleMarker
              title={p.title}
              imageUrl={p.cover_image}
              ringColor="rgba(0,0,0,0.62)"
              bubbleBg={isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.60)"}
              bubbleBorder={isDark ? "rgba(255,255,255,0.18)" : "rgba(20,20,26,0.10)"}
            />
          </Marker>
        ))}
      </MapView>

      {/* top overlays */}
      <View style={styles.topWrap}>
        <View style={[styles.searchBar, { backgroundColor: surfaceStrong, borderColor: border }]}>
          <Ionicons name="search" size={18} color={placeholder} />
          <TextInput
            value={query}
            onChangeText={runSearch}
            placeholder="search gatherings"
            placeholderTextColor={placeholder}
            style={[styles.searchInput, { color: text, fontFamily: fonts.body }]}
            onFocus={openSearch}
            returnKeyType="search"
          />
          {searchLoading ? (
            <ActivityIndicator />
          ) : query.length > 0 ? (
            <Pressable onPress={clearSearch} style={styles.iconBtn}>
              <Ionicons name="close" size={18} color={text} />
            </Pressable>
          ) : null}
        </View>

        {/* controls */}
        <View style={styles.controlsCol}>
          <Pressable style={[styles.roundBtn, { backgroundColor: surface, borderColor: border }]} onPress={recenterOnUser}>
            <Ionicons name="locate" size={20} color={text} />
          </Pressable>

          <Pressable style={[styles.roundBtn, { backgroundColor: surface, borderColor: border }]} onPress={resetNorth}>
            <Compass
              heading={deviceHeading}
              textColor={text}
              accent={colors.text}
              fonts={fonts}
              borderColor={border}
              dialBg={surface}
              isDark={isDark}
            />
          </Pressable>
        </View>

        {/* dropdown */}
        {searchOpen &&
          (searchResults.length > 0 || (query.trim().length >= 2 && !searchLoading)) && (
            <View style={[styles.dropdown, { backgroundColor: surfaceStrong, borderColor: border }]}>
              {searchResults.length > 0 ? (
                <FlatList
                  keyboardShouldPersistTaps="handled"
                  data={searchResults}
                  keyExtractor={(i) => `sr-${i.id}`}
                  renderItem={({ item }) => (
                    <Pressable style={[styles.resultRow, { borderTopColor: border }]} onPress={() => focusEvent(item)}>
                      <Image
                        source={{
                          uri:
                            item.cover_image ||
                            "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(item.title),
                        }}
                        style={[styles.resultAvatar, { borderColor: border }]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultTitle, { color: text, fontFamily: fonts.display }]} numberOfLines={1}>
                          {item.title.toLowerCase()}
                        </Text>
                        <Text
                          style={[
                            styles.resultMeta,
                            {
                              color: isDark ? "rgba(255,255,255,0.68)" : "rgba(20,20,26,0.60)",
                              fontFamily: fonts.body,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {new Date(item.start_time).toLocaleString().toLowerCase()}
                          {item.location ? ` • ${item.location.toLowerCase()}` : ""}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={placeholder} />
                    </Pressable>
                  )}
                />
              ) : (
                <View style={styles.emptyRow}>
                  <Text style={[styles.resultMeta, { color: isDark ? "rgba(255,255,255,0.68)" : "rgba(20,20,26,0.60)", fontFamily: fonts.body }]}>
                    no matches
                  </Text>
                </View>
              )}
            </View>
          )}
      </View>

      {/* bottom category filter */}
      <View style={styles.bottomFilters}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={allCategories}
          keyExtractor={(c) => `cat-${c.id}`}
          ListHeaderComponent={
            <Pressable
              onPress={selectAll}
              style={[
                styles.filterChip,
                { backgroundColor: chipSurface, borderColor: border },
                activeCategoryIds.size === 0 ? { backgroundColor: activeChipFill, borderColor: activeChipBorder } : null,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: activeCategoryIds.size === 0 ? activeChipText : text, fontFamily: fonts.strong },
                ]}
              >
                all
              </Text>
            </Pressable>
          }
          renderItem={({ item }) => {
            const active = activeCategoryIds.has(item.id);
            return (
              <Pressable
                onPress={() => toggleCategory(item.id)}
                style={[
                  styles.filterChip,
                  { backgroundColor: chipSurface, borderColor: border },
                  active ? { backgroundColor: activeChipFill, borderColor: activeChipBorder } : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? activeChipText : text, fontFamily: fonts.strong },
                  ]}
                >
                  {item.name.toLowerCase()}
                </Text>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        />
      </View>

      {loading && (
        <View style={[styles.loadingOverlay, { backgroundColor: surfaceStrong, borderColor: border }]}>
          <ActivityIndicator />
          <Text style={[styles.muted, { color: isDark ? "rgba(255,255,255,0.72)" : "rgba(20,20,26,0.60)", fontFamily: fonts.strong }]}>
            loading pins…
          </Text>
        </View>
      )}

      {locationDenied && (
        <View style={[styles.banner, { backgroundColor: surfaceStrong, borderColor: border }]}>
          <Text style={[styles.bannerText, { color: text, fontFamily: fonts.body }]}>
            location permission denied — showing a default region.
          </Text>
        </View>
      )}
    </View>
  );
}

function Compass({
  heading,
  textColor,
  accent,
  fonts,
  borderColor,
  dialBg,
  isDark,
}: {
  heading: number;
  textColor: string;
  accent: string;
  fonts: any;
  borderColor: string;
  dialBg: string;
  isDark: boolean;
}) {
  const needleRotation = `${-heading}deg`;
  return (
    <View style={styles.compassWrap}>
      <View style={[styles.compassDial, { backgroundColor: dialBg, borderColor }]}>
        <Text style={[styles.compassN, { color: accent, fontFamily: fonts.display }]}>n</Text>
        <View style={[styles.needle, { transform: [{ rotate: needleRotation }] }]}>
          <View style={[styles.needleNorth, { borderBottomColor: accent }]} />
          <View style={[styles.needleSouth, { borderTopColor: textColor, opacity: isDark ? 0.85 : 0.70 }]} />
          <View style={[styles.needleHub, { backgroundColor: textColor }]} />
        </View>
      </View>
    </View>
  );
}

function EventBubbleMarker({
  title,
  imageUrl,
  ringColor,
  bubbleBg,
  bubbleBorder,
}: {
  title: string;
  imageUrl?: string | null;
  ringColor: string;
  bubbleBg: string;
  bubbleBorder: string;
}) {
  const avatar = imageUrl || "https://api.dicebear.com/7.x/initials/png?seed=" + encodeURIComponent(title);

  return (
    <View style={styles.markerWrap}>
      <View style={[styles.markerBubble, { backgroundColor: bubbleBg, borderColor: ringColor }]}>
        <Image source={{ uri: avatar }} style={[styles.markerAvatar, { borderColor: bubbleBorder }]} />
      </View>
      <View style={[styles.markerTail, { backgroundColor: ringColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { marginTop: 8, fontWeight: "700", textTransform: "lowercase" },

  topWrap: { position: "absolute", top: 54, left: 14, right: 14 },

  searchBar: {
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",

    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  searchInput: { flex: 1, fontWeight: "600", paddingVertical: 0, textTransform: "lowercase" },
  iconBtn: { padding: 6 },

  controlsCol: { position: "absolute", right: 0, top: 56, gap: 10 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  dropdown: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: 320,

    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  emptyRow: { padding: 14, alignItems: "center" },
  resultAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1 },
  resultTitle: { letterSpacing: 0.2, fontSize: 14, fontWeight: "800", textTransform: "lowercase" },
  resultMeta: { marginTop: 2, fontSize: 12, fontWeight: "600", textTransform: "lowercase" },

  bottomFilters: { position: "absolute", left: 0, right: 0, bottom: 22, paddingVertical: 10 },
  filterChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  filterChipText: { fontWeight: "700", fontSize: 12, textTransform: "lowercase" },

  markerWrap: { alignItems: "center" },
  markerBubble: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, padding: 2 },
  markerAvatar: { width: "100%", height: "100%", borderRadius: 21, borderWidth: 1 },
  markerTail: {
    width: 10,
    height: 10,
    transform: [{ rotate: "45deg" }],
    marginTop: -2,
    borderRadius: 2,
    opacity: 0.9,
  },

  loadingOverlay: {
    position: "absolute",
    top: 170,
    alignSelf: "center",
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  banner: {
    position: "absolute",
    bottom: 160,
    left: 14,
    right: 14,
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  bannerText: { textAlign: "center", fontWeight: "600", textTransform: "lowercase" },

  compassWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  compassDial: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  compassN: { position: "absolute", top: 2, fontSize: 10, fontWeight: "800", letterSpacing: 0.6, textTransform: "lowercase" },
  needle: { position: "absolute", width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  needleNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ translateY: -5 }],
  },
  needleSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ translateY: 5 }],
  },
  needleHub: { position: "absolute", width: 6, height: 6, borderRadius: 3, opacity: 0.95 },
});
