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
const PRIMARY = "#000";

// Clean / minimal surfaces (matches your desired vibe)
const lightColors: ThemeColors = {
  bg: "#F7F7F7",
  card: "#FFFFFF",
  card2: "#FFFFFF",

  text: "#1C1C1E",
  muted: "#8A8A8E",

  border: "#E5E5E5",

  primary: PRIMARY,

  tabBarBg: "#FFFFFF",
  tabBarBorder: "#E5E5E5",
};

const darkColors: ThemeColors = {
  bg: "#121212",
  card: "#1E1E1E",
  card2: "#282828",

  text: "#fff",
  muted: "#999",

  border: "#333",

  primary: PRIMARY,

  tabBarBg: "#121212",
  tabBarBorder: "#333",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("light");

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
