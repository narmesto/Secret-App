import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { useTheme } from "../../context/theme";
import { EventRow } from "../../types";
import { formatWhen } from "../../utils/time";
import { initialsAvatar } from "../../utils/string";

export function EventImageCard({
    variant = "large",
    event,
    saved,
    saving,
    friendSaveCount,
    onPress,
    onToggleSave,
}: {
    variant?: "large" | "small";
    event: EventRow;
    saved: boolean;
    saving: boolean;
    friendSaveCount: number;
    onPress: () => void;
    onToggleSave: () => void;
}) {
  const { colors, fonts } = useTheme();

  if (variant === "small") {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.smallCard, { backgroundColor: colors.card }]}
      >
        <Image
          source={{ uri: event.cover_image || initialsAvatar(event.title) }}
          style={styles.smallImage}
        />
        <View style={{ padding: 12 }}>
          <Text
            style={{
              color: colors.text,
              fontFamily: fonts.strong,
              fontSize: 14,
            }}
            numberOfLines={1}
          >
            {event.title.toLowerCase()}
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.body,
              fontSize: 12,
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {formatWhen(event.start_time).toLowerCase()}
          </Text>
          {friendSaveCount > 0 && (
            <View style={styles.smallFriendSaveBadge}>
              <Ionicons name="people" size={10} color={colors.muted} />
              <Text style={styles.smallFriendSaveText}>{friendSaveCount}</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 24 }}>
      <ImageBackground
        source={{ uri: event.cover_image || initialsAvatar(event.title) }}
        style={styles.largeCard}
        imageStyle={{ borderRadius: 24 }}
      >
        <View style={styles.largeCardOverlay}>
          {friendSaveCount > 0 && (
            <View style={styles.friendSaveBadge}>
              <Ionicons name="people" size={12} color="#fff" />
              <Text style={styles.friendSaveText}>{friendSaveCount}</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={[styles.largeCardTitle, { fontFamily: fonts.display }]}>
              {event.title.toLowerCase()}
            </Text>
            <Text style={[styles.largeCardSubtitle, { fontFamily: fonts.body }]}>
              {formatWhen(event.start_time).toLowerCase()}
            </Text>
          </View>

          <Pressable onPress={onToggleSave} style={styles.largeCardSaveBtn}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={22}
                color="#fff"
              />
            )}
          </Pressable>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  smallCard: {
    width: 150,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 12,
  },
  smallImage: {
    width: "100%",
    height: 100,
    backgroundColor: "#eee",
  },
  largeCard: {
    width: "100%",
    height: 220,
    borderRadius: 24,
    justifyContent: "flex-end",
  },
  largeCardOverlay: {
    backgroundColor: "rgba(0,0,0,0.35)",
    flex: 1,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  largeCardTitle: {
    color: "#fff",
    fontSize: 24,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  largeCardSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    marginTop: 4,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  largeCardSaveBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  friendSaveBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  friendSaveText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  smallFriendSaveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  smallFriendSaveText: {
    color: "#999",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
