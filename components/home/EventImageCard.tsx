import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
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
import { EventRow, Profile } from "../../types";
import { formatWhen } from "../../utils/time";
import { initialsAvatar } from "../../utils/string";
import { supabase } from "../../supabase";

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
  const [owner, setOwner] = useState<Profile | null>(null);

  useEffect(() => {
    if (!event.owner_id) return;

    const fetchOwner = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", event.owner_id)
        .single();

      if (error) {
        console.error("Error fetching event owner:", error);
      } else {
        setOwner(data);
      }
    };

    fetchOwner();
  }, [event.owner_id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        smallCard: {
          width: 240,
          borderRadius: 16,
          overflow: "hidden",
          marginRight: 16,
          backgroundColor: colors.card,
        },
        smallImage: {
          width: "100%",
          height: 100,
          backgroundColor: colors.card,
        },
        largeCard: {
          width: "100%",
          backgroundColor: colors.bg,
        },
        largeImage: {
          width: "100%",
          height: 220,
          backgroundColor: colors.bg,
        },
        largeCardInfoBar: {
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
        },
        largeCardTitle: {
          fontSize: 20,
          color: colors.text,
        },
        largeCardSubtitle: {
          fontSize: 14,
          color: colors.muted,
          marginTop: 4,
        },
        largeCardSaveBtn: {
          padding: 8,
        },
        ownerInfoBar: {
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
        },
        ownerAvatar: {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.bg,
          marginRight: 10,
        },
        ownerName: {
          fontSize: 14,
          color: colors.text,
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
          color: colors.muted,
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
        },
      }),
    [colors]
  );

  if (variant === "small") {
    return (
      <Pressable onPress={onPress} style={styles.smallCard}>
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
    <Pressable onPress={onPress}>
      <View style={styles.largeCard}>
        {owner && (
          <View style={styles.ownerInfoBar}>
            <Image
              source={{ uri: owner.avatar_url || initialsAvatar(owner.display_name || '') }}
              style={styles.ownerAvatar}
            />
            <Text style={[styles.ownerName, { fontFamily: fonts.body }]}>
              {(owner.display_name || '').toLowerCase()}
            </Text>
          </View>
        )}
        <Image
          source={{ uri: event.cover_image || initialsAvatar(event.title) }}
          style={styles.largeImage}
        />
        <View style={styles.largeCardInfoBar}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.largeCardTitle, { fontFamily: fonts.display }]}>
              {event.title.toLowerCase()}
            </Text>
            <Text style={[styles.largeCardSubtitle, { fontFamily: fonts.body }]}>
              {formatWhen(event.start_time).toLowerCase()} • {event.location || "location tbd"}
            </Text>
          </View>
          <Pressable onPress={onToggleSave} style={styles.largeCardSaveBtn}>
            {saving ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Ionicons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={22}
                color={colors.text}
              />
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
