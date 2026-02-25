
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/auth';
import { useTheme } from '../../context/theme';

type Participant = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type GroupHeaderAvatarProps = {
  participants: Participant[];
  avatar_url: string | null;
  size?: number;
};

const MAX_AVATARS_IN_GRID = 4;

export default function GroupHeaderAvatar({ participants = [], avatar_url, size = 42 }: GroupHeaderAvatarProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const otherParticipants = participants.filter(p => p.id !== user?.id);
  const borderRadius = size / 2;

  if (avatar_url) {
    return (
      <Image
        source={{ uri: avatar_url }}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  const getAvatarSource = (p: Participant) => ({
    uri: p.avatar_url || `https://api.dicebear.com/7.x/initials/png?seed=${p.username}`,
  });

  if (otherParticipants.length === 0) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="people" size={size * 0.6} color={colors.text} />
      </View>
    );
  }

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
    <View style={[styles.gridContainer, { width: size, height: size, borderRadius }]}>
      {participantsToShow.map((p, index) => (
        <View key={p.id} style={getAvatarStyle(index)}>
          <Image
            source={getAvatarSource(p)}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
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
