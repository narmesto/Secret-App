// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../../context/theme";

function TabBarButton(props: any) {
  // Default tab button wrapper
  const { onPress, accessibilityState, children } = props;
  const focused = accessibilityState?.selected;

  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, focused ? styles.tabBtnFocused : null]}>
      {children}
    </Pressable>
  );
}

function CreateTabButton(props: any) {
  // Big centered create button that creeps over the tab bar
  const { onPress, accessibilityState, children } = props;
  const focused = accessibilityState?.selected;

  return (
    <Pressable onPress={onPress} style={styles.createBtnWrap} accessibilityRole="button">
      <View style={[styles.createBtn, focused ? styles.createBtnFocused : null]}>
        {children}
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const { colors, resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  const active = isDark ? "#ffffff" : colors.primary;
  const inactive = isDark ? "rgba(255,255,255,0.55)" : "rgba(20,20,26,0.45)";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,

        tabBarStyle: [
          styles.tabBar,
          {
            backgroundColor: colors.tabBarBg,
            borderTopColor: colors.tabBarBorder,
          },
        ],

        tabBarLabelStyle: styles.label,

        // note: we override the button per-screen below where needed
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "home",
          tabBarButton: (p) => <TabBarButton {...p} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="social"
        options={{
          title: "social",
          tabBarButton: (p) => <TabBarButton {...p} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />

      {/* center create */}
      <Tabs.Screen
        name="create"
        options={{
          title: "create",
          tabBarButton: (p) => <CreateTabButton {...p} />,
          tabBarIcon: ({ color }) => (
            <Ionicons name="add" size={30} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title: "map",
          tabBarButton: (p) => <TabBarButton {...p} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "profile",
          tabBarButton: (p) => <TabBarButton {...p} />,
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const BAR_HEIGHT = Platform.OS === "ios" ? 70 : 64;

const styles = StyleSheet.create({
  tabBar: {
    height: BAR_HEIGHT,
    borderTopWidth: 1,

    // keep it slim
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 18 : 12,

    // allow the create button to float over it
    overflow: "visible",
  },

  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "lowercase",
    marginTop: 2,
  },

  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnFocused: {},

  // create button that floats
  createBtnWrap: {
    width: 86,
    alignItems: "center",
    justifyContent: "center",

    // pull upward so it creeps over the bar
    marginTop: -22,
  },
  createBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,

    // subtle ring / depth
    backgroundColor: "rgb(195, 170, 230)",
    borderWidth: 1,
    borderColor: "rgb(195, 170, 230)",

    alignItems: "center",
    justifyContent: "center",

    // shadow
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 10,
      },
    }),
  },
  createBtnFocused: {
    backgroundColor: "rgba(73,8,176,0.22)",
    borderColor: "rgba(73,8,176,0.32)",
  },
});
