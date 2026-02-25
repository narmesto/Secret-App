import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View, TouchableOpacity, TextInput, StyleSheet, Image, RefreshControl } from "react-native";
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
      <Feather name="edit" size={24} color={colors.text} />
    </TouchableOpacity>
  );
};

export default function Social() {
  const { user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchThreads();
    setRefreshing(false);
  }, [fetchThreads]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim() === "") {
        setSearchResults([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${searchQuery}%`)
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

  useFocusEffect(
    useCallback(() => {
      fetchThreads();
    }, [fetchThreads])
  );

  const handleSearchResultPress = (peer: any) => {
    router.push({ pathname: '/user/[id]', params: { id: peer.id } });
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => handleSearchResultPress(item)}>
      <View style={styles.searchResultItem}>
        <Image
          source={{ uri: item.avatar_url || 'https://placekitten.com/g/200/200' }}
          style={styles.searchResultAvatar}
        />
        <View>
          <Text style={styles.searchResultName}>{item.display_name}</Text>
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
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search for users..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.trim() !== "" && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Feather name="x" size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 10,
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBar: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    padding: 12,
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
