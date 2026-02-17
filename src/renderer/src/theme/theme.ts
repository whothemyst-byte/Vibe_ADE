export const THEME = {
  backgroundPrimary: '#061018',
  backgroundSecondary: '#0b1622',
  paneBackground: '#0d1a2a',
  topBarBackground: '#091421',
  accentPrimary: '#16e6df',
  accentSecondary: '#22cbd4',
  textPrimary: '#ecf8ff',
  textMuted: '#8ea5bc',
  terminalPrompt: '#16e6df',
  terminalError: '#FF4D4D',
  terminalSuccess: '#3AFF8F',
  terminalWarning: '#FFC857'
} as const;

export type ThemeToken = keyof typeof THEME;
