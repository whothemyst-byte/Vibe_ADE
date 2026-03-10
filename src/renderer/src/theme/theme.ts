export type ThemeId =
  | 'system'
  | 'dark'
  | 'light'
  | 'midnight'
  | 'graphite'
  | 'solarized'
  | 'nord'
  | 'dracula'
  | 'monokai'
  | 'gruvbox'
  | 'evergreen'
  | 'rose';

export type ThemeBase = 'dark' | 'light';

export interface ThemeTokens {
  bgPage: string;
  bgHeader: string;
  bgPanel: string;
  bgPanel2: string;
  bgElev: string;
  text: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentStrong: string;
  bodyOverlay: string;
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
}

export interface ThemeDefinition {
  id: Exclude<ThemeId, 'system'>;
  label: string;
  base: ThemeBase;
  tokens: ThemeTokens;
}

export const THEME_DEFINITIONS: Record<Exclude<ThemeId, 'system'>, ThemeDefinition> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    base: 'dark',
    tokens: {
      bgPage: '#0a0a0c',
      bgHeader: '#0f0f12',
      bgPanel: '#121214',
      bgPanel2: '#16161a',
      bgElev: '#1a1c21',
      text: '#f3f4f6',
      textMuted: '#9ca3af',
      border: '#25272d',
      borderStrong: '#31343d',
      accent: '#3b82f6',
      accentStrong: '#2563eb',
      bodyOverlay: 'rgba(59, 130, 246, 0.18)',
      scrollbarTrack: '#10151d',
      scrollbarThumb: '#465064',
      scrollbarThumbHover: '#5a6780'
    }
  },
  light: {
    id: 'light',
    label: 'Light',
    base: 'light',
    tokens: {
      bgPage: '#f3f6fb',
      bgHeader: '#ffffff',
      bgPanel: '#ffffff',
      bgPanel2: '#f8fafc',
      bgElev: '#ffffff',
      text: '#0f172a',
      textMuted: '#64748b',
      border: '#dbe1ea',
      borderStrong: '#c4cfdd',
      accent: '#3b82f6',
      accentStrong: '#2563eb',
      bodyOverlay: 'rgba(59, 130, 246, 0.1)',
      scrollbarTrack: '#e7edf5',
      scrollbarThumb: '#a6b3c6',
      scrollbarThumbHover: '#8799b2'
    }
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    base: 'dark',
    tokens: {
      bgPage: '#05080f',
      bgHeader: '#0a101b',
      bgPanel: '#0d1523',
      bgPanel2: '#111b2d',
      bgElev: '#0f1a2a',
      text: '#e6f1ff',
      textMuted: '#8aa0bf',
      border: '#1a2436',
      borderStrong: '#24324a',
      accent: '#16e6df',
      accentStrong: '#22cbd4',
      bodyOverlay: 'rgba(22, 230, 223, 0.12)',
      scrollbarTrack: '#0b111b',
      scrollbarThumb: '#2a3a52',
      scrollbarThumbHover: '#3a4d6b'
    }
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    base: 'dark',
    tokens: {
      bgPage: '#0f1113',
      bgHeader: '#15181b',
      bgPanel: '#1a1e22',
      bgPanel2: '#20262b',
      bgElev: '#181c20',
      text: '#eef0f2',
      textMuted: '#a1a8b3',
      border: '#2a3036',
      borderStrong: '#363d46',
      accent: '#f59e0b',
      accentStrong: '#d97706',
      bodyOverlay: 'rgba(245, 158, 11, 0.12)',
      scrollbarTrack: '#151b21',
      scrollbarThumb: '#3a414d',
      scrollbarThumbHover: '#4a5463'
    }
  },
  solarized: {
    id: 'solarized',
    label: 'Solarized',
    base: 'light',
    tokens: {
      bgPage: '#fdf6e3',
      bgHeader: '#fefaf0',
      bgPanel: '#fffbe9',
      bgPanel2: '#f5efda',
      bgElev: '#fff7e1',
      text: '#586e75',
      textMuted: '#93a1a1',
      border: '#e6dcc2',
      borderStrong: '#d8cfb9',
      accent: '#268bd2',
      accentStrong: '#1f6ea5',
      bodyOverlay: 'rgba(38, 139, 210, 0.12)',
      scrollbarTrack: '#eee6d3',
      scrollbarThumb: '#b8a982',
      scrollbarThumbHover: '#a2936d'
    }
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    base: 'dark',
    tokens: {
      bgPage: '#2e3440',
      bgHeader: '#3b4252',
      bgPanel: '#2f3542',
      bgPanel2: '#3a4252',
      bgElev: '#343b49',
      text: '#eceff4',
      textMuted: '#a7b0bf',
      border: '#434c5e',
      borderStrong: '#4c566a',
      accent: '#88c0d0',
      accentStrong: '#81a1c1',
      bodyOverlay: 'rgba(136, 192, 208, 0.14)',
      scrollbarTrack: '#2b303b',
      scrollbarThumb: '#4c566a',
      scrollbarThumbHover: '#5b677d'
    }
  },
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    base: 'dark',
    tokens: {
      bgPage: '#17161f',
      bgHeader: '#1f1c2c',
      bgPanel: '#232136',
      bgPanel2: '#2b2844',
      bgElev: '#25233a',
      text: '#f8f8f2',
      textMuted: '#b6b7c2',
      border: '#35304f',
      borderStrong: '#3f3a5a',
      accent: '#bd93f9',
      accentStrong: '#9b6ef3',
      bodyOverlay: 'rgba(189, 147, 249, 0.14)',
      scrollbarTrack: '#1e1b2a',
      scrollbarThumb: '#4a4163',
      scrollbarThumbHover: '#5a4f78'
    }
  },
  monokai: {
    id: 'monokai',
    label: 'Monokai',
    base: 'dark',
    tokens: {
      bgPage: '#1f201c',
      bgHeader: '#272822',
      bgPanel: '#2d2e28',
      bgPanel2: '#32332c',
      bgElev: '#2a2b25',
      text: '#f8f8f2',
      textMuted: '#c0c0b6',
      border: '#3a3b33',
      borderStrong: '#45473d',
      accent: '#a6e22e',
      accentStrong: '#7acb2a',
      bodyOverlay: 'rgba(166, 226, 46, 0.14)',
      scrollbarTrack: '#24251f',
      scrollbarThumb: '#4b4d43',
      scrollbarThumbHover: '#5b5e51'
    }
  },
  gruvbox: {
    id: 'gruvbox',
    label: 'Gruvbox',
    base: 'dark',
    tokens: {
      bgPage: '#1d2021',
      bgHeader: '#282828',
      bgPanel: '#2a2a2a',
      bgPanel2: '#32302f',
      bgElev: '#2c2b2a',
      text: '#ebdbb2',
      textMuted: '#bdae93',
      border: '#3c3836',
      borderStrong: '#504945',
      accent: '#fabd2f',
      accentStrong: '#d79921',
      bodyOverlay: 'rgba(250, 189, 47, 0.14)',
      scrollbarTrack: '#202020',
      scrollbarThumb: '#4f463e',
      scrollbarThumbHover: '#6b5c4e'
    }
  },
  evergreen: {
    id: 'evergreen',
    label: 'Evergreen',
    base: 'dark',
    tokens: {
      bgPage: '#0f1614',
      bgHeader: '#131d19',
      bgPanel: '#182320',
      bgPanel2: '#1c2a26',
      bgElev: '#16211e',
      text: '#e6f4ef',
      textMuted: '#9cb7ae',
      border: '#24322e',
      borderStrong: '#2f3e39',
      accent: '#34d399',
      accentStrong: '#10b981',
      bodyOverlay: 'rgba(52, 211, 153, 0.14)',
      scrollbarTrack: '#121b18',
      scrollbarThumb: '#3a4a45',
      scrollbarThumbHover: '#4a5b55'
    }
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    base: 'light',
    tokens: {
      bgPage: '#fff4f6',
      bgHeader: '#fffafb',
      bgPanel: '#fff7f8',
      bgPanel2: '#fceced',
      bgElev: '#fff1f2',
      text: '#4c1d2f',
      textMuted: '#9f6f83',
      border: '#f2d6dd',
      borderStrong: '#e6c3cc',
      accent: '#f43f5e',
      accentStrong: '#e11d48',
      bodyOverlay: 'rgba(244, 63, 94, 0.12)',
      scrollbarTrack: '#f7e2e6',
      scrollbarThumb: '#d9a7b2',
      scrollbarThumbHover: '#c78f9d'
    }
  }
};

export const THEME_LABELS: Record<ThemeId, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
  midnight: 'Midnight',
  graphite: 'Graphite',
  solarized: 'Solarized',
  nord: 'Nord',
  dracula: 'Dracula',
  monokai: 'Monokai',
  gruvbox: 'Gruvbox',
  evergreen: 'Evergreen',
  rose: 'Rose'
};

export const THEME_ORDER: ThemeId[] = [
  'system',
  'dark',
  'light',
  'midnight',
  'graphite',
  'solarized',
  'nord',
  'dracula',
  'monokai',
  'gruvbox',
  'evergreen',
  'rose'
];
