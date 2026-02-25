import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Thread, Message, Profile } from "../../../types";
import GroupHeaderAvatar from "../../../components/social/GroupHeaderAvatar";

export default function GroupConversation() {
  const { user } = useAuth();
  const { colors, resolvedScheme, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === "dark";

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const threadId = useMemo(() => {
    const raw = params.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").trim();
  }, [params]);

  const glass = isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,24,0.06)";
  const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(17,17,24,0.10)";

  const [thread, setThread] = useState<Thread | null>(null);
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);

  const fetchThreadData = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);

    const { data: threadData, error: threadError } = await supabase
        .from("threads")
        .select("*")
        .eq("id", threadId)
        .maybeSingle();

    if (threadError) {
        console.log("[group thread error]", threadError.message);
    }

    if (threadData) {
        setThread(threadData);
    }

    const { data: participantLinks, error: participantLinksError } = await supabase
        .from('thread_participants')
        .select('user_id')
        .eq('thread_id', threadId);

    if (participantLinksError) {
        console.error('Error fetching participants', participantLinksError);
        setLoading(false);
        return;
    }

    const userIds = participantLinks.map(p => p.user_id);

    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds);

        if (profilesError) {
            console.error('Error fetching participant profiles', profilesError);
        } else {
            setParticipants(profiles || []);
        }
    }

    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    if (!user?.id || !threadId) return;
    fetchThreadData();
  }, [user?.id, threadId, fetchThreadData]);

  const fetchMessages = useCallback(async () => {
    if (!threadId) return;

    const { data: messagesData, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("[group fetch messages error]", error.message);
      setMsgs([]);
      return;
    }

    if (!messagesData) {
      setMsgs([]);
      return;
    }

    const senderIds = [...new Set(messagesData.map((m) => m.sender_id))];
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", senderIds);

    if (profilesError) {
      console.log("[group fetch profiles error]", profilesError.message);
      // Still try to render messages, even if profiles fail
      setMsgs(messagesData as Message[]);
      return;
    }

    const profilesById = profilesData.reduce<{ [key: string]: any }>((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {});

    const finalMessages = messagesData.map((m) => ({
      ...m,
      sender: profilesById[m.sender_id],
    }));

    setMsgs(finalMessages as Message[]);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;

    fetchMessages().then(() => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    });

    const channel = supabase
      .channel(`group-thread-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // We need to fetch the sender profile for the new message
          supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .eq("id", newMsg.sender_id)
            .single()
            .then(({ data: senderProfile, error }) => {
              if (error) {
                console.log("[realtime profile fetch error]", error.message);
                // Add message even if profile fetch fails
                setMsgs((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
              } else {
                const msgWithSender: Message = {
                  ...newMsg,
                  sender: senderProfile as any,
                };
                setMsgs((prev) => {
                  if (prev.some((m) => m.id === msgWithSender.id)) return prev;
                  return [...prev, msgWithSender];
                });
              }
              setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
            });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] Subscribed to group thread ${threadId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, fetchMessages]);

  useFocusEffect(
    useCallback(() => {
      if (!threadId || !user?.id) return;

      const markAsRead = async () => {
        try {
          await supabase.rpc("update_last_read_at", {
            p_thread_id: threadId,
            p_user_id: user.id,
          });
        } catch (error) {
          console.error("Error marking as read:", error);
        }
      };

      markAsRead();
    }, [threadId, user?.id])
  );

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
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          sender_id: user.id,
          body: body,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (data) {
        // No need to manually add, realtime will handle it
      }
    } catch (e: any) {
      Alert.alert("send failed", e?.message ?? "something went wrong");
    } finally {
      setSending(false);
    }
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
            <GroupHeaderAvatar participants={participants} size={42} />
            <Text style={[styles.headerName, { color: colors.text, fontFamily: fonts.display }]} numberOfLines={1}>
                {thread?.name || 'Group Chat'}
            </Text>
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
  headerName: { fontSize: 13, fontWeight: "900", textTransform: "lowercase" },
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
