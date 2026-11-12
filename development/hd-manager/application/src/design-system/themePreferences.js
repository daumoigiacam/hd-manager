export const HD_THEME_STORAGE_KEY = 'hd_manager_theme_preference';

export function normalizeHDThemePreference(value) {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveHDTheme(preference, prefersDark = false) {
  const normalized = normalizeHDThemePreference(preference);
  return normalized === 'system' ? (prefersDark ? 'dark' : 'light') : normalized;
}

export function readHDThemePreference(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return normalizeHDThemePreference(target?.getItem(HD_THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function writeHDThemePreference(value, storage) {
  const normalized = normalizeHDThemePreference(value);
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(HD_THEME_STORAGE_KEY, normalized);
  } catch {
    // Theme remains usable for this session when browser storage is unavailable.
  }
  return normalized;
}
