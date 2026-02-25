import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, Image, StyleSheet, TextInput, Pressable, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../supabase';
import { Profile, Thread } from '../../../types';
import { useTheme } from '../../../context/theme';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GroupHeaderAvatar from '../../../components/social/GroupHeaderAvatar';

            export default function EditGroupScreen() {
  const { threadId } = useLocalSearchParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [groupName, setGroupName] = useState('');
  const [participants, setParticipants] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!threadId) return;

    const fetchThreadInfo = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .single();
      
      if (error) {
        console.error('Error fetching thread:', error);
      } else {
        setThread(data);
                    if (data.name) {
                      setGroupName(data.name);
                    } else {
                      const { data: participantLinks, error: linksError } = await supabase
                        .from('thread_participants')
                        .select('user_id')
                        .eq('thread_id', threadId);
                      if (linksError) {
                        console.error('Error fetching participant links:', linksError);
                        return;
                      }
                      const userIds = participantLinks.map(p => p.user_id);
                      const { data: profiles, error: profilesError } = await supabase
                        .from('profiles')
                        .select('id, display_name')
                        .in('id', userIds);
                      if (profilesError) {
                        console.error('Error fetching profiles:', profilesError);
                      } else {
                        const currentUserId = (await supabase.auth.getUser()).data.user?.id;
                        const otherParticipants = profiles.filter(p => p.id !== currentUserId);
                        setGroupName(otherParticipants.map(p => p.display_name).join(', '));
                      }
                    }
      }
    };

    const fetchParticipants = async () => {
      const { data: participantLinks, error: linksError } = await supabase
        .from('thread_participants')
        .select('user_id')
        .eq('thread_id', threadId);

      if (linksError) {
        console.error('Error fetching participant links:', linksError);
        setLoading(false);
        return;
      }

      const userIds = participantLinks.map(p => p.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
      } else {
        const transformedProfiles = profiles.map(p => ({ ...p, username: p.display_name || 'user' })) as unknown as Profile[];
        setParticipants(transformedProfiles || []);
      }
    };

    Promise.all([fetchThreadInfo(), fetchParticipants()]).finally(() => setLoading(false));
  }, [threadId]);

  const handleSave = async () => {
    if (!threadId || !groupName) return;

    const { error } = await supabase
      .from('threads')
      .update({ name: groupName })
      .eq('id', threadId);

    if (error) {
      Alert.alert('Error', 'Failed to update group name.');
    } else {
      Alert.alert('Success', 'Group name updated.');
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      uploadAvatar(uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!threadId) return;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const filePath = `${threadId}/${new Date().getTime()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      Alert.alert('Error', 'Failed to upload avatar.');
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from('threads')
      .update({ avatar_url: publicUrl })
      .eq('id', threadId);

    if (updateError) {
      Alert.alert('Error', 'Failed to update avatar URL.');
    } else {
      Alert.alert('Success', 'Avatar updated.');
      // Update local state to show the new avatar immediately
      setThread(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
    }
  };

  const styles = getStyles(colors, insets);

  if (loading) {
    return <ActivityIndicator />;
  }

  const ListHeader = () => (
    <View style={styles.headerContainer}>
      <Pressable onPress={pickImage} style={styles.avatarContainer}>
        {thread?.avatar_url ? (
          <Image source={{ uri: thread.avatar_url }} style={styles.groupAvatar} />
        ) : (
          <GroupHeaderAvatar participants={participants as any} avatar_url={null} size={100} />
        )}
        <View style={styles.editIconContainer}>
          <Text style={styles.editIcon}>Edit</Text>
        </View>
      </Pressable>

      <View style={styles.nameContainer}>
        <TextInput
          style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Group Name"
          placeholderTextColor={colors.text}
        />
        <Pressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save Name</Text>
        </Pressable>
      </View>

      <Text style={[styles.participantsHeader, { color: colors.text }]}>Participants</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={28} color={colors.primary} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/user/${item.id}`)}>
            <View style={[styles.participantContainer, { backgroundColor: colors.card }]}>
              <Image 
                source={{ uri: item.avatar_url || `https://api.dicebear.com/7.x/initials/png?seed=${item.username}` }}
                style={styles.avatar}
              />
              <Text style={{ color: colors.text }}>{item.display_name}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: { primary: string; card: string; text: string; border: string; background: string; }, insets: any) => StyleSheet.create({
  backButton: {
    position: 'absolute',
    top: insets.top + 5,
    left: 10,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999, // This creates the pill shape
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 17,
    marginLeft: 2,
  },
  headerContainer: {
    paddingBottom: 10,
  },
  avatarContainer: {
    alignItems: 'center',
    padding: 20,
    position: 'relative',
  },
  groupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editIconContainer: {
    position: 'absolute',
    bottom: 20,
    right: '35%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    padding: 5,
  },
  editIcon: {
    color: 'white',
    fontSize: 12,
  },
  nameContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  nameInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  participantsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  participantContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 30,
    backgroundColor: 'grey',
    marginVertical: 5,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});