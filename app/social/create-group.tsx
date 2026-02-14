import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../../context/auth";
import { useTheme } from "../../context/theme";
import { supabase } from "../../supabase";

type FriendRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  selected?: boolean;
};

export default function CreateGroupScreen() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const isDark = resolvedScheme === "dark";

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetchFriends();
  }, [user?.id]);

  async function fetchFriends() {
    setLoading(true);

    // 1. Get accepted friendships
    const { data: friendships, error: fErr } = await supabase
      .from("friendships")
      .select("user_low, user_high")
      .eq("status", "accepted")
      .or(`user_low.eq.${user?.id},user_high.eq.${user?.id}`);

    if (fErr) {
      console.log("[create-group friendships error]", fErr.message);
      setLoading(false);
      return;
    }

    const friendIds = Array.from(
      new Set(
        (friendships ?? []).map((r: any) =>
          r.user_low === user?.id ? r.user_high : r.user_low
        )
      )
    );

    if (friendIds.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // 2. Get profiles
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", friendIds)
      .order("display_name", { ascending: true });

    if (pErr) {
      console.log("[create-group profiles error]", pErr.message);
      setLoading(false);
      return;
    }

    setFriends(
      (profiles ?? []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name || "User",
        username: p.username || "",
        avatar_url: p.avatar_url,
        selected: false,
      }))
    );
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setFriends((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  }

  async function createGroup() {
    const selected = friends.filter((f) => f.selected);
    if (selected.length === 0) return Alert.alert("Select at least one friend");

    setCreating(true);

    try {
      // 1. Create Thread (Group)
      // We leave name null so it can be set later, or we can default it.
      // Schema likely allows nullable name for groups.
      const { data: thread, error: tErr } = await supabase
        .from("threads")
        .insert({
          is_group: true,
          name: null, // User will set this later in group settings
        })
        .select()
        .single();

      if (tErr) throw new Error(tErr.message);
      if (!thread) throw new Error("Failed to create thread");

      // 2. Add Participants (Me + Selected)
      const participants = [
        { thread_id: thread.id, user_id: user?.id },
        ...selected.map((f) => ({ thread_id: thread.id, user_id: f.id })),
      ];

      const { error: pErr } = await supabase
        .from("thread_participants")
        .insert(participants);

      if (pErr) throw new Error(pErr.message);

      // 3. Navigate to DM
      router.replace({
        pathname: "/social/dm/[peerId]" as any,
        params: { threadId: thread.id },
      });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCreating(false);
    }
  }

  const filteredFriends = friends.filter((f) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      f.display_name.toLowerCase().includes(q) ||
      f.username.toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.headerBtn, { borderColor: border, backgroundColor: glass }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.display }]}>
          New Group
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* Search Bar */}
        <View style={[styles.searchWrap, { backgroundColor: glass, borderColor: border }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search friends..."
            placeholderTextColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(17,17,24,0.45)"}
            style={[styles.searchInput, { color: colors.text, fontFamily: fonts.body }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={{ color: colors.muted, fontFamily: fonts.strong, marginLeft: 4 }}>
          Select Friends
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => toggleSelect(item.id)}
              style={[
                styles.row,
                {
                  backgroundColor: item.selected
                    ? "rgba(73,8,176,0.12)"
                    : "transparent",
                  borderColor: item.selected ? colors.primary : border,
                },
              ]}
            >
              <Image
                source={{
                  uri:
                    item.avatar_url ||
                    `https://api.dicebear.com/7.x/initials/png?seed=${item.display_name}`,
                }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.strong }}>
                  {item.display_name}
                </Text>
                {item.username ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>@{item.username}</Text>
                ) : null}
              </View>
              {item.selected && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </Pressable>
          )}
        />
      )}

      <View style={{ padding: 16 }}>
        <Pressable
          onPress={createGroup}
          disabled={creating || friends.filter((f) => f.selected).length === 0}
          style={[
            styles.createBtn,
            {
              backgroundColor: colors.primary,
              opacity: creating || friends.filter((f) => f.selected).length === 0 ? 0.5 : 1,
            },
          ]}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "bold" }}>Create Group</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800" },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  searchWrap: {
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#ccc" },
  createBtn: {
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
});
