import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import { supabase } from '../supabase';
import { useFocusEffect } from 'expo-router';

type LocationRequest = {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  events: {
    id: string;
    title: string;
  }[] | null;
  profiles: {
    id: string;
    display_name: string;
  }[] | null;
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { colors, fonts } = useTheme();
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('location_requests')
      .select(`
        id,
        status,
        events (id, title),
        profiles (id, display_name)
      `)
      .eq('events.owner_id', user.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching location requests:', error.message);
      Alert.alert('Error', 'Could not fetch your notifications.');
      setRequests([]);
    } else {
      setRequests(data as LocationRequest[]);
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [fetchRequests])
  );

  const handleUpdateRequest = async (id: string, newStatus: 'approved' | 'denied') => {
    const { error } = await supabase
      .from('location_requests')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      Alert.alert('Error', `Failed to ${newStatus === 'approved' ? 'approve' : 'deny'} the request.`);
      console.error('Update error:', error.message);
    } else {
      // Refresh the list after updating
      fetchRequests();
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.requestText, { color: colors.text, fontFamily: fonts.body }]}>
              <Text style={{ fontFamily: fonts.strong }}>{item.profiles?.[0]?.display_name || 'A user'}</Text>
              {' requested access to '}
              <Text style={{ fontFamily: fonts.strong }}>{item.events?.[0]?.title || 'your event'}</Text>.
            </Text>
            <View style={styles.buttonContainer}>
              <Pressable 
                style={[styles.button, styles.approveButton]} 
                onPress={() => handleUpdateRequest(item.id, 'approved')}
              >
                <Text style={styles.buttonText}>Approve</Text>
              </Pressable>
              <Pressable 
                style={[styles.button, styles.denyButton]} 
                onPress={() => handleUpdateRequest(item.id, 'denied')}
              >
                <Text style={styles.buttonText}>Deny</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.center, { backgroundColor: colors.bg }]}>
            <Text style={{ color: colors.muted, fontFamily: fonts.body }}>You have no new notifications.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  requestText: {
    fontSize: 16,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 10,
  },
  approveButton: {
    backgroundColor: '#28a745',
  },
  denyButton: {
    backgroundColor: '#dc3545',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
