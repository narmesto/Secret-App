
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Participant = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type ChatAvatarProps = {
  participant: Participant;
  size?: number;
};

export default function ChatAvatar({ participant, size = 40 }: ChatAvatarProps) {
  const getAvatarSource = (p: Participant) => ({
    uri: p.avatar_url || `https://api.dicebear.com/7.x/initials/png?seed=${p.username}`,
  });

  if (!participant) {
    return (
      <View style={[styles.avatar, { width: size, height: size, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="person" size={size * 0.6} color="#fff" />
      </View>
    );
  }

  return (
    <Image
      source={getAvatarSource(participant)}
      style={[styles.avatar, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 20, // circular
    backgroundColor: '#eee',
  },
});
