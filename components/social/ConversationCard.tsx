
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/auth';
import { useTheme } from '../../context/theme';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type Participant = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Thread = {
  id: string;
  created_at: string;
  is_dm: boolean;
  title: string;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  participants: Participant[];
  unread_count: number;
};

type ConversationCardProps = {
  thread: Thread;
};

const MAX_AVATARS_IN_GRID = 4;

export default function ConversationCard({ thread }: ConversationCardProps) {
  const { user } = useAuth();
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const avatarSize = 50;

  const isDM = thread.is_dm;
  const participants = thread.participants || [];
  const otherParticipants = participants.filter(p => p.id !== user?.id);

  // The SQL function now provides the correct title and avatar directly.
  // We just need to determine the correct navigation action.
  let onPressAction;
  if (isDM) {
    const peer = otherParticipants[0];
    // Navigate to the DM screen using the peer's ID
    onPressAction = () => router.push(`/social/dm/${peer.id}`);
  } else {
    // Navigate to the group chat screen using the thread's ID
    onPressAction = () => router.push(`/social/group/${thread.id}`);
  }

  const getAvatarSource = (url: string | null, seed: string) => ({
    uri: url || `https://api.dicebear.com/7.x/initials/png?seed=${seed}`,
  });

  const renderAvatar = () => {
    if (isDM) {
      return (
        <Image
          source={getAvatarSource(thread.avatar_url, thread.title)}
          style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: colors.card }}
        />
      );
    }

    // Group Chat Avatar Logic
    if (thread.avatar_url) {
      return (
        <Image
          source={getAvatarSource(thread.avatar_url, thread.title)}
          style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: colors.card }}
        />
      );
    }

    const borderRadius = avatarSize / 2;

    if (otherParticipants.length === 0) {
      return (
        <View style={[styles.avatarContainer, { width: avatarSize, height: avatarSize, borderRadius, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="people" size={avatarSize * 0.6} color={colors.muted} />
        </View>
      );
    }

    // New dynamic layout for group avatars
    const participantsToShow = otherParticipants.slice(0, 4);
    const numParticipants = participantsToShow.length;

    const getAvatarStyle = (index: number): import('react-native').ViewStyle => {
      if (numParticipants === 1) {
        return { width: '100%', height: '100%' };
      }
      if (numParticipants === 2) {
        return { width: '50%', height: '100%' };
      }
      if (numParticipants === 3) {
        if (index === 0) return { width: '100%', height: '50%' };
        return { width: '50%', height: '50%' };
      }
      // 4 participants
      return { width: '50%', height: '50%' };
    };

    return (
      <View style={[styles.gridContainer, { width: avatarSize, height: avatarSize, borderRadius, overflow: 'hidden' }]}>
        {participantsToShow.map((p, index) => (
          <View key={p.id} style={getAvatarStyle(index)}>
            <Image
              source={getAvatarSource(p.avatar_url, p.username)}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        ))}
      </View>
    );
  };

  const dateToShow = thread.last_message_at || thread.created_at;

  // Don't render a card if it's a DM that somehow has no other participant
  if (isDM && otherParticipants.length === 0) {
    return null;
  }

  return (
    <TouchableOpacity onPress={onPressAction}>
      <View style={styles.container}>
        <View style={styles.avatarContainer}>
          {renderAvatar()}
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{thread.title}</Text>
            <View style={styles.rightHeader}>
              {thread.unread_count > 0 && <View style={styles.unreadDot} />}
              <Text style={styles.timestamp}>
                {new Date(dateToShow).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {thread.last_message || 'Conversation created'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    marginRight: 10,
    overflow: 'hidden',
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  rightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    fontSize: 16,
    color: colors.text,
    maxWidth: '80%',
  },
  timestamp: {
    fontSize: 12,
    color: colors.muted,
  },
  lastMessage: {
    fontSize: 14,
    color: colors.muted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ECC71',
    marginRight: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  gridImage: {},
  plusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
