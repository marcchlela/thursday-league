export const THEME_STORAGE_KEY = "thursday-league:theme";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const resolved = resolveTheme(preference, systemDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-user-theme="true"]');
  if (themeMeta) themeMeta.content = resolved === "light" ? "#f6f2e8" : "#11110f";
  return resolved;
}
