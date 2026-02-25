import { useState, useEffect } from 'react';
import { View, FlatList, Alert, SafeAreaView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '../../context/auth';
import { supabase } from '../../supabase';
import UserSelectItem from '../../components/social/UserSelectItem';
import { useTheme, ThemeColors } from '../../context/theme';

export default function Compose() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user?.id);

      if (error) {
        console.error('Error fetching users:', error);
      } else {
        setUsers(data || []);
      }
    };

    fetchUsers();
  }, [user?.id]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleNext = async () => {
    if (selectedUsers.length === 0 || !user) return;

    if (selectedUsers.length === 1) {
      // DM
      const peerId = selectedUsers[0];
      router.replace(`/social/dm/${peerId}`);
    } else {
      // Group
      try {
        const { data, error } = await supabase.rpc('get_or_create_group_thread', {
          p_user_ids: selectedUsers,
        });

        if (error) throw error;

        const threadId = data[0]?.thread_id;

        if (threadId) {
          router.replace(`/social/group/${threadId}`);
        } else {
          throw new Error('Could not find or create group thread.');
        }
      } catch (error: any) {
        console.error('Error handling group chat:', error);
        Alert.alert('Error', 'Could not process group chat. ' + error.message);
      }
    }
  };

  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerBackTitle: "Back", headerShown: true }} />
      <FlatList
        data={users}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <UserSelectItem
            user={item}
            isSelected={selectedUsers.includes(item.id)}
            onPress={() => toggleUserSelection(item.id)}
            colors={colors}
          />
        )}
      />
      <TouchableOpacity
        style={[styles.button, selectedUsers.length === 0 && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={selectedUsers.length === 0}
      >
        <Text style={styles.buttonText}>
          {selectedUsers.length === 1 ? "Message" : "Create Group"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    margin: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.muted,
  },
  buttonText: {
    color: colors.card,
    fontWeight: 'bold',
    fontSize: 16,
  },
});