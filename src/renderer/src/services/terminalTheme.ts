import type { ITheme } from 'xterm';

export function clampTerminalDimension(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, rounded));
}

export function resolveTerminalTheme(): ITheme {
  // QuanSynd palette — xterm.js does not resolve CSS variables, so hex literals are required.
  return {
    background: '#14110B',
    foreground: '#F4ECD9',
    cursor: '#D79A3D',
    cursorAccent: '#14110B',
    selectionBackground: 'rgba(215,154,61,0.25)',
    selectionInactiveBackground: 'rgba(215,154,61,0.16)',
    black: '#14110B',
    brightBlack: '#524A39',
    red: '#B53D2C',
    brightRed: '#D26352',
    green: '#2F7D52',
    brightGreen: '#5BA77D',
    yellow: '#C28A30',
    brightYellow: '#D79A3D',
    blue: '#2A5C8A',
    brightBlue: '#5B8AB4',
    magenta: '#7A4F10',
    brightMagenta: '#A47628',
    cyan: '#2F7D7D',
    brightCyan: '#5BA7A7',
    white: '#D2CCBE',
    brightWhite: '#F4ECD9'
  };
}
