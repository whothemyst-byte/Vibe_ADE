export type AppearanceMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'vibe-ade-appearance';

function isAppearanceMode(value: string | null): value is AppearanceMode {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function getStoredAppearanceMode(): AppearanceMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isAppearanceMode(stored)) {
    return stored;
  }
  return 'dark';
}

export function setStoredAppearanceMode(mode: AppearanceMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveEffectiveTheme(mode: AppearanceMode): 'dark' | 'light' {
  if (mode !== 'system') {
    return mode;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  const resolved = resolveEffectiveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
}

