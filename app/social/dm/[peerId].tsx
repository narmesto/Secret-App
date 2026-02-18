import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../context/auth";
import { useTheme } from "../../../context/theme";
import { supabase } from "../../../supabase";
import { Profile as ProfileLite, Message as DMMessage } from "@/types";

function initialsAvatar(seed: string) {
  return `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(seed)}`;
}

function pair(a: string, b: string) {
  const [low, high] = [a, b].sort();
  return { user_low: low, user_high: high };
}

type डीएमSearchParams = {
  peerId?: string | string[];
  id?: string | string[];
};

export default function DMConversation() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === "dark";

  const params = useLocalSearchParams<डीएमSearchParams>();
  const peerId = useMemo(() => {
    const raw = params.peerId ?? params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").trim();
  }, [params]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [peer, setPeer] = useState<ProfileLite | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<DMMessage>>(null);

  const fetchPeer = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", peerId)
      .maybeSingle();

    if (error) console.log("[dm peer profile error]", error.message);

    if (data?.id) {
      setPeer({
        id: String(data.id),
        display_name: data.display_name ?? null,
        avatar_url: data.avatar_url ?? null,
      });
    } else {
      setPeer({ id: peerId, display_name: "user", avatar_url: null });
    }
  }, [peerId]);

  const ensureThread = useCallback(async () => {
    if (!user?.id) return;

    const { user_low, user_high } = pair(user.id, peerId);

    const { data: existing, error: exErr } = await supabase
      .from("dm_threads")
      .select("id")
      .eq("user_low", user_low)
      .eq("user_high", user_high)
      .maybeSingle();

    if (exErr) console.log("[dm ensureThread lookup error]", exErr.message);

    if (existing?.id) {
      setThreadId(String(existing.id));
      return;
    }

    const { data: created, error: crErr } = await supabase
      .from("dm_threads")
      .insert({ user_low, user_high })
      .select("id")
      .maybeSingle();

    if (crErr) {
      console.log("[dm ensureThread create error]", crErr.message);
      return;
    }

    if (created?.id) setThreadId(String(created.id));
  }, [user?.id, peerId]);

  useEffect(() => {
    if (!user?.id || !peerId) return;

    async function init() {
      setLoading(true);
      try {
        await fetchPeer();
        await ensureThread();
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user?.id, peerId, fetchPeer, ensureThread]);

  const fetchMessages = useCallback(async () => {
    if (!threadId) return;

    const { data, error } = await supabase
      .from("dm_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300);

    if (error) {
      console.log("[dm fetch messages error]", error.message);
      setMsgs([]);
      return;
    }

    setMsgs(data ?? []);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;

    fetchMessages().then(() => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    });

    const channel = supabase
      .channel(`dm-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as DMMessage;
          setMsgs((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] Subscribed to thread ${threadId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, fetchMessages]);

  async function send() {
    if (!user?.id) {
      Alert.alert("sign in required");
      router.push("/login");
      return;
    }
    if (!threadId) return Alert.alert("not ready", "thread not created yet.");

    const body = text.trim();
    if (!body) return;
    if (sending) return;

    setSending(true);
    setText("");

    try {
      const { data, error } = await supabase
        .from("dm_messages")
        .insert({
          thread_id: threadId,
          sender_id: user.id,
          body,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (data) {
        setMsgs((prev) => [...prev, data as DMMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      }
    } catch (e: any) {
      Alert.alert("send failed", e?.message ?? "something went wrong");
    } finally {
      setSending(false);
    }
  }

  const name = (peer?.display_name ?? "user").toLowerCase();
  const avatar = peer?.avatar_url || initialsAvatar(name);

  function goViewProfile() {
    router.push({ pathname: "/user/[id]", params: { id: peerId } });
  }

  const keyboardOffset = Platform.OS === "ios" ? 0 : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.bg }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
        >
          <View style={[styles.backRow, { paddingTop: insets.top + 6 }]}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { backgroundColor: glass, borderColor: border }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.headerCenter}>
            <Image source={{ uri: avatar }} style={styles.headerAvatar} />
            <Text style={[styles.headerName, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
              {name}
            </Text>
            <Pressable
              onPress={goViewProfile}
              style={[styles.viewProfileBtn, { backgroundColor: "rgba(73,8,176,0.12)", borderColor: colors.border }]}
            >
              <Text style={[styles.viewProfileText, { color: colors.text, fontFamily: fonts.strong }]}>
                view profile
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator />
                <Text style={[styles.muted, { color: colors.muted, fontFamily: fonts.body }]}>loading…</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={msgs}
                keyExtractor={(m) => String(m.id)}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  paddingTop: 8,
                  paddingBottom: 12,
                }}
                renderItem={({ item }) => {
                  const mine = item.sender_id === user?.id;
                  return (
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                        { borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: mine ? "#fff" : colors.text, fontFamily: fonts.body }]}>
                        {String(item.body ?? "").toLowerCase()}
                      </Text>
                    </View>
                  );
                }}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              />
            )}
          </View>

          <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <View style={[styles.inputWrap, { backgroundColor: glass, borderColor: border }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="message…"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(17,17,24,0.45)"}
                style={[styles.input, { color: colors.text, fontFamily: fonts.body }]}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={send}
                onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)}
              />
              <Pressable
                onPress={send}
                disabled={sending || !text.trim()}
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: "rgba(73,8,176,0.18)",
                    borderColor: border,
                    opacity: sending || !text.trim() ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons name="send" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { marginTop: 8, fontWeight: "700", textTransform: "lowercase" },

  backRow: { paddingHorizontal: 14 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 6,
    gap: 5,
  },
  headerAvatar: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#111" },
  headerName: { fontSize: 13, fontWeight: "900", textTransform: "lowercase" },
  viewProfileBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  viewProfileText: { fontWeight: "900", fontSize: 11, textTransform: "lowercase" },

  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(73,8,176,0.95)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.06)" },
  bubbleText: { fontWeight: "700", lineHeight: 18, textTransform: "lowercase" },

  composer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  inputWrap: {
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 6,
    gap: 10,
  },
  input: { flex: 1, fontSize: 13, fontWeight: "700", textTransform: "lowercase" },
  sendBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
