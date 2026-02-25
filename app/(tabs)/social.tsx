import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View, TouchableOpacity, TextInput, StyleSheet, Image } from "react-native";
import { useAuth } from "../../context/auth";
import { supabase } from "../../supabase";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import ConversationCard from "../../components/social/ConversationCard";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../context/theme";

type Thread = {
  id: string;
  created_at: string;
  is_dm: boolean;
  title: string;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  participants: any[];
  unread_count: number;
};

const CreateButton = () => {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={() => router.push("/social/compose")}
      style={{ marginRight: 10 }}
    >
      <Feather name="edit" size={24} color={colors.primary} />
    </TouchableOpacity>
  );
};

export default function Social() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const styles = makeStyles(colors);

  const fetchThreads = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase.rpc("get_user_threads_with_unread_count", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("Error fetching threads:", error);
      setThreads([]);
    } else {
      setThreads(data || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim() === "") {
        setSearchResults([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles_public")
        .select("id, username, avatar_url:profiles!inner(avatar_url)")
        .or(`username.ilike.%${searchQuery}%`)
        .neq("id", user?.id);

      if (error) {
        console.error("Error searching users:", error);
        return;
      }

      setSearchResults(data || []);
    };

    const debounceSearch = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(debounceSearch);
  }, [searchQuery, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchThreads();
    }, [fetchThreads])
  );

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("social_feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
        },
        (payload) => {
          fetchThreads();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          fetchThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchThreads]);

  const handleSearchResultPress = (peer: any) => {
    router.push(`/social/dm/${peer.id}`);
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => handleSearchResultPress(item)}>
      <View style={styles.searchResultItem}>
        <Image
          source={{ uri: item.avatar_url || 'https://placekitten.com/g/200/200' }}
          style={styles.searchResultAvatar}
        />
        <View>
          <Text style={styles.searchResultName}>{item.username}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && threads.length === 0) {
    return <Text style={styles.emptyText}>Loading...</Text>;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerRight: () => <CreateButton /> }} />
      <TextInput
        style={styles.searchBar}
        placeholder="Search for users..."
        placeholderTextColor={colors.muted}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {searchQuery.trim() !== "" ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderSearchResult}
          ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
        />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ConversationCard thread={item} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No conversations yet.</Text>}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchBar: {
    padding: 12,
    backgroundColor: colors.card,
    margin: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.text,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchResultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
  },
  searchResultName: {
    fontWeight: 'bold',
    color: colors.text,
  },
  searchResultUsername: {
    color: colors.muted,
  },
  emptyText: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
  },
});
