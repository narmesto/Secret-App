
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/auth';

type Participant = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type GroupHeaderAvatarProps = {
  participants: Participant[];
  size?: number;
};

const MAX_AVATARS_IN_GRID = 4;

export default function GroupHeaderAvatar({ participants = [], size = 42 }: GroupHeaderAvatarProps) {
  const { user } = useAuth();
  const otherParticipants = participants.filter(p => p.id !== user?.id);
  const borderRadius = 16;

  const getAvatarSource = (p: Participant) => ({
    uri: p.avatar_url || `https://api.dicebear.com/7.x/initials/png?seed=${p.username}`,
  });

  if (otherParticipants.length === 0) {
    return (
      <View style={[styles.container, { width: size, height: size, borderRadius, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="people" size={size * 0.6} color="#fff" />
      </View>
    );
  }

  if (otherParticipants.length === 1) {
    return (
      <Image
        source={getAvatarSource(otherParticipants[0])}
        style={{ width: size, height: size, borderRadius, backgroundColor: '#eee' }}
      />
    );
  }

  if (otherParticipants.length > MAX_AVATARS_IN_GRID) {
    const shownParticipants = otherParticipants.slice(0, MAX_AVATARS_IN_GRID - 1);
    const totalRemaining = otherParticipants.length - shownParticipants.length;
    return (
      <View style={[styles.gridContainer, { width: size, height: size, borderRadius }]}>
        {shownParticipants.map((p) => (
          <Image
            key={p.id}
            source={getAvatarSource(p)}
            style={[styles.gridImage, { width: size / 2, height: size / 2 }]}
          />
        ))}
        <View style={[styles.plusContainer, { width: size / 2, height: size / 2, backgroundColor: '#ccc' }]}>
          <Text style={{ color: '#fff', fontSize: size * 0.25 }}>+{totalRemaining}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.gridContainer, { width: size, height: size, borderRadius }]}>
      {otherParticipants.map((p) => (
        <Image
          key={p.id}
          source={getAvatarSource(p)}
          style={[styles.gridImage, { width: size / 2, height: size / 2 }]}
        />
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
