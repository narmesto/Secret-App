// app/_layout.tsx
import { Stack, usePathname, useRootNavigationState, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../context/auth";
import { ThemeProvider, useTheme } from "../context/theme";

function RouteGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const navState = useRootNavigationState();
  const pathname = usePathname();

  useEffect(() => {
    // wait until navigation is mounted
    if (!navState?.key) return;
    if (loading) return;

    // public routes (no auth required)
    const isLogin = pathname === "/login";
    const isRegister = pathname === "/register";
    const isCheckEmail = pathname.startsWith("/check-email");

    // protected areas
    const inTabs = pathname.startsWith("/(tabs)");
    const inEvent = pathname.startsWith("/event");

    // logged out: block protected routes
    if (!user && (inTabs || inEvent) && !isLogin && !isRegister && !isCheckEmail) {
      router.replace("/login");
      return;
    }

    // logged in: block login-ish routes
    if (user && (isLogin || isRegister || isCheckEmail)) {
      router.replace("/(tabs)/home");
      return;
    }
  }, [navState?.key, loading, user, pathname, router]);

  return null;
}

/**
 * Internal layout that can access theme (needed for StatusBar color)
 */
function RootStack() {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === "dark";

  return (
    <>
      {/* Fixes time/battery visibility */}
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor="transparent" translucent />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

import { ActionSheetProvider } from "@expo/react-native-action-sheet";

export default function RootLayout() {
  return (
    <ActionSheetProvider>
      <ThemeProvider>
        <AuthProvider>
          <RouteGate />
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </ActionSheetProvider>
  );
}
