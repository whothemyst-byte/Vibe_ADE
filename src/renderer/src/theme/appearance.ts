import { THEME_DEFINITIONS, type ThemeId, type ThemeTokens } from './theme';

export type AppearanceMode = ThemeId;

const STORAGE_KEY = 'vibe-ade-appearance';

function isAppearanceMode(value: string | null): value is AppearanceMode {
  if (!value) {
    return false;
  }
  return value === 'system' || Object.prototype.hasOwnProperty.call(THEME_DEFINITIONS, value);
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
    return THEME_DEFINITIONS[mode].base;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveThemeTokens(mode: AppearanceMode): ThemeTokens {
  if (mode === 'system') {
    const fallback = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    return THEME_DEFINITIONS[fallback].tokens;
  }
  return THEME_DEFINITIONS[mode].tokens;
}

function applyThemeTokens(tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.style.setProperty('--bg-page', tokens.bgPage);
  root.style.setProperty('--bg-header', tokens.bgHeader);
  root.style.setProperty('--bg-panel', tokens.bgPanel);
  root.style.setProperty('--bg-panel-2', tokens.bgPanel2);
  root.style.setProperty('--bg-elev', tokens.bgElev);
  root.style.setProperty('--text', tokens.text);
  root.style.setProperty('--text-muted', tokens.textMuted);
  root.style.setProperty('--border', tokens.border);
  root.style.setProperty('--border-strong', tokens.borderStrong);
  root.style.setProperty('--accent', tokens.accent);
  root.style.setProperty('--accent-strong', tokens.accentStrong);
  root.style.setProperty('--body-overlay', tokens.bodyOverlay);
  root.style.setProperty('--scrollbar-track', tokens.scrollbarTrack);
  root.style.setProperty('--scrollbar-thumb', tokens.scrollbarThumb);
  root.style.setProperty('--scrollbar-thumb-hover', tokens.scrollbarThumbHover);
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  const resolved = resolveEffectiveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  const tokens = resolveThemeTokens(mode);
  applyThemeTokens(tokens);
  try {
    void window.vibeAde?.system.setWindowTheme({ base: resolved, headerColor: tokens.bgHeader });
  } catch {
    // No-op: window theme sync is best-effort.
  }
}
