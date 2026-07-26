"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyTheme, isThemePreference, ResolvedTheme, THEME_STORAGE_KEY, ThemePreference } from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const preferenceRef = useRef<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialPreference = isThemePreference(stored) ? stored : "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    preferenceRef.current = initialPreference;
    setPreferenceState(initialPreference);
    setResolvedTheme(applyTheme(initialPreference, media.matches));

    function onSystemThemeChange(event: MediaQueryListEvent) {
      if (preferenceRef.current === "system") setResolvedTheme(applyTheme("system", event.matches));
    }

    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  function setPreference(nextPreference: ThemePreference) {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    preferenceRef.current = nextPreference;
    setPreferenceState(nextPreference);
    setResolvedTheme(applyTheme(nextPreference, systemDark));
  }

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider.");
  return value;
}
