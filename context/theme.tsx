import React, { createContext, useContext, useMemo, useState } from "react";
import { Appearance, ColorSchemeName, Platform } from "react-native";

type Mode = "light" | "dark" | "system";

type ThemeColors = {
  // base surfaces
  bg: string;
  card: string;
  card2: string;

  // text
  text: string;
  muted: string;

  // strokes
  border: string;

  // brand
  primary: string;

  // tab bar
  tabBarBg: string;
  tabBarBorder: string;
};

type ThemeFonts = {
  display: string; // headings / brand
  body: string; // body text
  strong: string; // medium-ish
};

type ThemeValue = {
  mode: Mode;
  resolvedScheme: "light" | "dark";
  setMode: (m: Mode) => void;
  colors: ThemeColors;
  fonts: ThemeFonts;
};

const ThemeContext = createContext<ThemeValue | null>(null);

// Keep your brand purple
const PRIMARY = "#4908B0";

// Clean / minimal surfaces (matches your desired vibe)
const lightColors: ThemeColors = {
  bg: "#F6F4F8",
  card: "#FFFFFF",
  card2: "#FFFFFF",

  text: "#14141A",
  muted: "rgba(20,20,26,0.58)",

  border: "rgba(20,20,26,0.10)",

  primary: PRIMARY,

  tabBarBg: "rgba(255,255,255,0.92)",
  tabBarBorder: "rgba(20,20,26,0.08)",
};

const darkColors: ThemeColors = {
  bg: "#0B0B0E",
  card: "rgba(255,255,255,0.06)",
  card2: "rgba(255,255,255,0.08)",

  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.62)",

  border: "rgba(255,255,255,0.12)",

  primary: PRIMARY,

  tabBarBg: "rgba(14,14,18,0.85)",
  tabBarBorder: "rgba(255,255,255,0.10)",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("system");

  const sys = Appearance.getColorScheme() as ColorSchemeName;
  const resolvedScheme: "light" | "dark" =
    mode === "system" ? (sys === "dark" ? "dark" : "light") : mode;

  const colors = resolvedScheme === "dark" ? darkColors : lightColors;

  // “Grafic-like” without a custom font:
  // - iOS: SF Pro (System) is already close
  // - Android: Roboto via sans-serif, with careful tracking + weights in styles
  const fonts: ThemeFonts = useMemo(
    () => ({
      display: Platform.select({ ios: "System", android: "sans-serif" }) as string,
      body: Platform.select({ ios: "System", android: "sans-serif" }) as string,
      strong: Platform.select({ ios: "System", android: "sans-serif-medium" }) as string,
    }),
    []
  );

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      resolvedScheme,
      setMode,
      colors,
      fonts,
    }),
    [mode, resolvedScheme, colors, fonts]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
