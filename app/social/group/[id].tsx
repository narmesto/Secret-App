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
  const styles = makeStyles(colors);
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
            const transformedProfiles = profiles.map(p => ({ ...p, username: p.display_name || 'user' }));
                    setParticipants(transformedProfiles || []);
        }
    }

    setLoading(false);
  }, [threadId]);

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

  useFocusEffect(
    useCallback(() => {
      fetchThreadData();
      fetchMessages();

      const markAsRead = async () => {
        if (!threadId || !user?.id) return;
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
    }, [fetchThreadData, fetchMessages, threadId, user?.id])
  );

  useEffect(() => {
    if (!threadId) return;

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
          fetchMessages();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "threads",
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          fetchThreadData();
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
  }, [threadId, fetchMessages, fetchThreadData]);

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
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTitle: () => (
            <View style={styles.headerContainer}>
              <GroupHeaderAvatar
                participants={participants as any}
                size={42}
                avatar_url={thread?.avatar_url || null}
              />
              <View style={styles.headerTitleContainer}>
                <Text style={[styles.headerName, { color: colors.text }]}>
                  {thread?.name || 'Group Chat'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {participants.length} members
                </Text>
              </View>
            </View>
          ),
          headerBackTitle: 'Back',
                            headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/social/group/edit', params: { threadId } })}
              style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.bg }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
        >

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
                      <Text style={[styles.bubbleText, { color: mine ? colors.primaryText : colors.text, fontFamily: fonts.body }]}>
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
                placeholderTextColor={colors.muted}
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
                    backgroundColor: glass,
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

const makeStyles = (colors: any) => StyleSheet.create({
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

  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleContainer: {
    flexDirection: 'column',
  },
  headerName: { fontSize: 13, fontWeight: "900", textTransform: "lowercase" },
  headerRightButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,

    alignItems: 'center',
    justifyContent: 'center',
  },
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
    backgroundColor: colors.primary,
  },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: colors.card },
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
