// app/(tabs)/create.tsx
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

type Category = { id: string; name: string };

type NominatimResult = {
  place_id?: number;
  lat: string;
  lon: string;
  importance?: number;
  place_rank?: number;
  class?: string;
  type?: string;
  address?: any;
};

function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  return Array.from(new Map(rows.map((r) => [keyFn(r), r])).values());
}

function safeString(v: any) {
  if (v == null) return "";
  return String(v);
}

function formatForStorage(d: Date) {
  return d.toISOString();
}

function formatForDisplay(d: Date) {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isAddressLike(r: any) {
  const cls = String(r?.class ?? "");
  const type = String(r?.type ?? "");
  if (cls === "boundary") return false;
  if (cls === "railway") return false;
  if (cls === "highway" && type === "residential") return false;
  if (cls === "place" && (type === "city" || type === "county" || type === "state")) return false;
  return cls === "amenity" || cls === "building" || cls === "place" || cls === "shop";
}

function normalizeKey(addr: any) {
  if (!addr) return "";
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ").toLowerCase();
  const city =
    (addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || "").toLowerCase();
  const state = String(addr.state || "").toLowerCase();
  const zip = String(addr.postcode || "").toLowerCase();
  return `${street}|${city}|${state}|${zip}`.replace(/\s+/g, " ").trim();
}

function formatUSAddress(addr: any) {
  if (!addr) return "";
  const street = ([addr.house_number, addr.road].filter(Boolean).join(" ") || addr.name || "").trim();
  const city = (addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || "").trim();
  const state = String(addr.state || "").trim();
  const zip = String(addr.postcode || "").trim();

  const line2 = [city, state].filter(Boolean).join(", ");
  const out = [street, line2, zip].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return out.toLowerCase();
}

async function nominatimSearchUS(query: string): Promise<NominatimResult[]> {
  const limit = 12;
  const url =
    `https://nominatim.openstreetmap.org/search?format=json` +
    `&q=${encodeURIComponent(query)}` +
    `&limit=${limit}` +
    `&addressdetails=1` +
    `&countrycodes=us` +
    `&dedupe=1` +
    `&extratags=1`;

  const res = await fetch(url, { headers: { "User-Agent": "gather-app/1.0" } });
  if (!res.ok) throw new Error(`address lookup failed (${res.status})`);
  return (await res.json()) as NominatimResult[];
}

function cleanAddressResults(raw: NominatimResult[]) {
  const filtered = (raw ?? []).filter(isAddressLike);

  const bestByKey = new Map<string, NominatimResult>();
  for (const r of filtered) {
    const key = normalizeKey(r?.address);
    if (!key) continue;

    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, r);
      continue;
    }

    const a = Number(existing?.importance ?? 0);
    const b = Number(r?.importance ?? 0);
    if (b > a) bestByKey.set(key, r);
  }

  const cleaned = Array.from(bestByKey.values()).sort((a, b) => {
    const impA = Number(a?.importance ?? 0);
    const impB = Number(b?.importance ?? 0);
    if (impB !== impA) return impB - impA;

    const prA = Number(a?.place_rank ?? 999);
    const prB = Number(b?.place_rank ?? 999);
    return prA - prB;
  });

  return cleaned.slice(0, 6);
}

export default function CreateScreen() {
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.05)";
  const border = isDark ? "rgba(255,255,255,0.16)" : "rgba(17,17,24,0.10)";

  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [locationText, setLocationText] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrResults, setAddrResults] = useState<NominatimResult[]>([]);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [startDate, setStartDate] = useState<Date>(() => new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [coverLocalUri, setCoverLocalUri] = useState<string | null>(null);
  const [coverPublicUrl, setCoverPublicUrl] = useState<string | null>(null);

  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

  const [useDeviceCoords, setUseDeviceCoords] = useState(true);

  const addrTimer = useRef<any>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const submitState = useMemo(() => {
    const t = title.trim();
    if (t.length < 3) return { ok: false, reason: "title must be at least 3 characters." };
    if (!startDate) return { ok: false, reason: "start time is required." };
    return { ok: true, reason: "" };
  }, [title, startDate]);

  async function fetchCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      console.log("[create categories error]", error.message);
      setAllCategories([]);
      return;
    }

    const cleaned: Category[] = (data ?? []).map((c: any, idx: number) => {
      const id = safeString(c?.id);
      const name = safeString(c?.name);
      const safeId = id || (name ? `name:${name}` : `row:${idx}`);
      return { id: safeId, name: (name || "untitled").toLowerCase() };
    });

    setAllCategories(dedupeByKey(cleaned, (x) => x.id));
  }

  function toggleCat(id: string) {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pickCoverImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("permission needed", "please allow photo access to pick a cover image.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
    });

    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri ?? null;
    if (!uri) return;

    setCoverLocalUri(uri);
    setCoverPublicUrl(null);
  }

  function discardCoverImage() {
    setCoverLocalUri(null);
    setCoverPublicUrl(null);
  }

  async function uploadCoverToStorage(localUri: string): Promise<string> {
    const fileResp = await fetch(localUri);
    const arrayBuffer = await fileResp.arrayBuffer();

    const ext = (localUri.split(".").pop() || "jpg").toLowerCase();
    const contentType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const path = `covers/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("event-covers")
      .upload(path, arrayBuffer, { contentType, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("could not generate public url.");
    return data.publicUrl;
  }

  async function getDeviceCoordsIfAllowed(): Promise<{ lat: number; lng: number } | null> {
    if (!useDeviceCoords) return null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  function closeAddressDropdown() {
    setAddrResults([]);
  }

  function pickAddress(r: NominatimResult) {
    const addr = r?.address;
    const pretty = formatUSAddress(addr);
    setLocationText(pretty || locationText);
    setPickedCoords({ lat: Number(r.lat), lng: Number(r.lon) });
    closeAddressDropdown();
    Keyboard.dismiss();
  }

  async function runAddressSearch(text: string) {
    setLocationText(text);
    setPickedCoords(null);

    const q = text.trim();
    if (addrTimer.current) clearTimeout(addrTimer.current);

    if (q.length < 4) {
      setAddrResults([]);
      return;
    }

    addrTimer.current = setTimeout(async () => {
      setAddrLoading(true);
      try {
        const raw = await nominatimSearchUS(q);
        const cleaned = cleanAddressResults(raw);
        setAddrResults(cleaned);
      } catch (e) {
        console.log("[address search error]", e);
        setAddrResults([]);
      } finally {
        setAddrLoading(false);
      }
    }, 250);
  }

  async function submit() {
    if (!submitState.ok) {
      Alert.alert("can’t post yet", submitState.reason);
      return;
    }

    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;

      if (!uid) {
        Alert.alert("not signed in", "please sign in again, then try posting.");
        return;
      }

      let coords: { lat: number; lng: number } | null = null;
      if (pickedCoords) coords = pickedCoords;
      else coords = await getDeviceCoordsIfAllowed();

      let coverUrl: string | null = coverPublicUrl;
      if (coverLocalUri && !coverUrl) {
        coverUrl = await uploadCoverToStorage(coverLocalUri);
        setCoverPublicUrl(coverUrl);
      }

      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        location: locationText.trim() || null,
        start_time: formatForStorage(startDate),
        cover_image: coverUrl || null,
        owner_id: uid,
      };

      if (coords) {
        payload.lat = coords.lat;
        payload.lng = coords.lng;
      }

      const { data: created, error: createErr } = await supabase
        .from("events")
        .insert(payload)
        .select("id")
        .single();

      if (createErr) {
        console.log("[create event error]", createErr);
        Alert.alert("couldn’t post event", createErr.message);
        return;
      }

      const eventId = String(created.id);

      // ✅ FIX: do NOT include owner_id here unless the column exists in event_categories
      const selected = Array.from(selectedCategoryIds);
      if (selected.length > 0) {
        const rows = selected.map((catId) => ({
          event_id: eventId,
          categories_id: catId,
        }));

        const { error: joinErr } = await supabase.from("event_categories").insert(rows);
        if (joinErr) {
          console.log("[event_categories insert error]", joinErr);
          Alert.alert("posted, but categories failed", joinErr.message);
        }
      }

      router.replace(`/event/${eventId}` as any);
    } catch (e: any) {
      console.log("[create submit exception]", e);
      Alert.alert("error", e?.message ?? "something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.headerBtn, { borderColor: border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.display }]}>create</Text>

          <Pressable
            onPress={submit}
            style={[
              styles.postBtn,
              {
                backgroundColor: "rgba(73,8,176,0.86)",
                borderColor: "rgba(73,8,176,0.20)",
                opacity: saving ? 0.6 : 1,
              },
            ]}
          >
            {saving ? <ActivityIndicator /> : <Text style={[styles.postBtnText, { fontFamily: fonts.strong }]}>post</Text>}
          </Pressable>
        </View>

        {!submitState.ok ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12 }}>{submitState.reason}</Text>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            closeAddressDropdown();
            Keyboard.dismiss();
          }}
        >
          <Field label="title *" colors={colors} fonts={fonts}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="worship night at liberty"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
              style={[
                styles.input,
                { backgroundColor: glass, borderColor: border, color: colors.text, fontFamily: fonts.body },
              ]}
            />
          </Field>

          <Field label="description" colors={colors} fonts={fonts}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="what is it? who is it for? what should people expect?"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
              style={[
                styles.textarea,
                { backgroundColor: glass, borderColor: border, color: colors.text, fontFamily: fonts.body },
              ]}
              multiline
            />
          </Field>

          <Field label="start time *" colors={colors} fonts={fonts}>
            <Pressable
              onPress={() => {
                closeAddressDropdown();
                Keyboard.dismiss();
                setShowDatePicker(true);
              }}
              style={[styles.input, styles.timePress, { backgroundColor: glass, borderColor: border }]}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontFamily: fonts.body }}>
                {formatForDisplay(startDate).toLowerCase()}
              </Text>
            </Pressable>

            {showDatePicker ? (
              <View
                style={[
                  styles.pickerWrap,
                  { backgroundColor: isDark ? "rgba(20,20,26,0.92)" : "#f4f4f6", borderColor: border },
                ]}
              >
                <DateTimePicker
                  value={startDate}
                  mode="datetime"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_evt, d) => {
                    if (Platform.OS !== "ios") setShowDatePicker(false);
                    if (d) setStartDate(d);
                  }}
                  textColor={isDark ? "#ffffff" : "#111118"}
                  themeVariant={isDark ? "dark" : "light"}
                />

                {Platform.OS === "ios" ? (
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    style={[styles.doneBtn, { backgroundColor: "rgba(73,8,176,0.14)", borderColor: border }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: "800", fontFamily: fonts.strong }}>done</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </Field>

          <Field label="address" colors={colors} fonts={fonts}>
            <View style={styles.addressContainer}>
              <TextInput
                value={locationText}
                onChangeText={runAddressSearch}
                placeholder="start typing an address"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.55)" : "rgba(17,17,24,0.45)"}
                style={[
                  styles.input,
                  { backgroundColor: glass, borderColor: border, color: colors.text, fontFamily: fonts.body },
                ]}
              />

              {addrLoading ? (
                <View style={styles.addrLoadingRow}>
                  <ActivityIndicator />
                </View>
              ) : null}

              {addrResults.length > 0 ? (
                <View
                  style={[
                    styles.addressDropdown,
                    { backgroundColor: isDark ? "rgba(20,20,26,0.98)" : "#f4f4f6", borderColor: border },
                  ]}
                >
                  {addrResults.map((item, idx) => (
                    <Pressable
                      key={`addr-${item.place_id ?? idx}`}
                      style={[
                        styles.addressRow,
                        { borderBottomColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.08)" },
                        idx === addrResults.length - 1 ? { borderBottomWidth: 0 } : null,
                      ]}
                      onPress={() => pickAddress(item)}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, fontFamily: fonts.body }}>
                        {formatUSAddress(item.address)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {pickedCoords ? (
              <Text style={[styles.hint, { color: colors.muted, fontFamily: fonts.body }]}>
                pin will be placed from selected address.
              </Text>
            ) : (
              <Text style={[styles.hint, { color: colors.muted, fontFamily: fonts.body }]}>
                tip: pick a suggestion to auto-pin it on the map.
              </Text>
            )}
          </Field>

          <Field label="cover image" colors={colors} fonts={fonts}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={pickCoverImage} style={[styles.pickBtn, { backgroundColor: glass, borderColor: border }]}>
                <Ionicons name="image-outline" size={18} color={colors.text} />
                <Text style={[styles.pickBtnText, { color: colors.text, fontFamily: fonts.strong }]}>
                  {coverLocalUri ? "change image" : "pick image"}
                </Text>
              </Pressable>

              {coverLocalUri ? (
                <Pressable
                  onPress={discardCoverImage}
                  style={[styles.pickBtn, { backgroundColor: glass, borderColor: border, paddingHorizontal: 14 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.text} />
                  <Text style={[styles.pickBtnText, { color: colors.text, fontFamily: fonts.strong }]}>remove</Text>
                </Pressable>
              ) : null}
            </View>

            {coverLocalUri ? <Image source={{ uri: coverLocalUri }} style={styles.coverPreview} /> : null}
          </Field>

          <Field label="categories" colors={colors} fonts={fonts}>
            <View style={styles.chipsRow}>
              {allCategories.length === 0 ? (
                <Text style={[styles.hint, { color: colors.muted, fontFamily: fonts.body }]}>no categories found.</Text>
              ) : (
                allCategories.map((c) => {
                  const active = selectedCategoryIds.has(c.id);
                  return (
                    <Pressable
                      key={`create-cat-${c.id}`}
                      onPress={() => toggleCat(c.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: glass, borderColor: border },
                        active ? { backgroundColor: "rgba(73,8,176,0.14)", borderColor: "rgba(73,8,176,0.22)" } : null,
                      ]}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12, fontFamily: fonts.strong }}>
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          </Field>

          <View style={[styles.card, { backgroundColor: glass, borderColor: border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.strong }]}>use device coords</Text>
              <Text style={[styles.cardSub, { color: colors.muted, fontFamily: fonts.body }]}>
                if you don’t select an address, we’ll try to pin using your current location.
              </Text>
            </View>

            <Pressable
              onPress={() => setUseDeviceCoords((v) => !v)}
              style={[
                styles.togglePill,
                {
                  backgroundColor: useDeviceCoords ? "rgba(73,8,176,0.18)" : "rgba(255,255,255,0.10)",
                  borderColor: border,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: "800", fontFamily: fonts.strong }}>
                {useDeviceCoords ? "on" : "off"}
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 26 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
  colors,
  fonts,
}: {
  label: string;
  children: React.ReactNode;
  colors: any;
  fonts: any;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.label, { color: colors.muted, fontFamily: fonts.strong }]}>{label}</Text>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "800", letterSpacing: 0.2, textTransform: "lowercase" },

  postBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  postBtnText: { color: "#fff", fontWeight: "800", textTransform: "lowercase" },

  container: { paddingHorizontal: 16, paddingBottom: 30 },

  label: { fontWeight: "800", fontSize: 12, letterSpacing: 0.2, textTransform: "lowercase" },

  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontWeight: "700",
  },
  textarea: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontWeight: "700",
  },

  timePress: { flexDirection: "row", alignItems: "center", gap: 10 },

  pickerWrap: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden",
    paddingVertical: 8,
  },
  doneBtn: {
    height: 42,
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  hint: { marginTop: 6, fontWeight: "600", fontSize: 12, textTransform: "lowercase" },

  addressContainer: { position: "relative" },
  addrLoadingRow: { position: "absolute", right: 12, top: 12 },

  addressDropdown: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 1000,
    elevation: 8,
  },
  addressRow: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },

  pickBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  pickBtnText: { fontWeight: "800", textTransform: "lowercase" },

  coverPreview: { width: "100%", height: 180, borderRadius: 14, marginTop: 10 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { fontWeight: "800", textTransform: "lowercase" },
  cardSub: { marginTop: 4, fontWeight: "600", fontSize: 12, lineHeight: 16, textTransform: "lowercase" },

  togglePill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
