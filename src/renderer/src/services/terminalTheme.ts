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

function withAlpha(color: string, alpha: number): string {
  const normalized = color.trim();
  if (normalized.startsWith('rgb')) {
    const values = normalized
      .replace(/rgba?\(/, '')
      .replace(')', '')
      .split(',')
      .map((value) => Number.parseFloat(value.trim()))
      .slice(0, 3);
    if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
      return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`;
    }
  }
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    const [r, g, b] =
      hex.length === 3
        ? hex.split('').map((ch) => Number.parseInt(ch + ch, 16))
        : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((ch) => Number.parseInt(ch, 16));
    if ([r, g, b].every((value) => Number.isFinite(value))) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

export function resolveTerminalTheme(): ITheme {
  const rootStyles = getComputedStyle(document.documentElement);
  const background = rootStyles.getPropertyValue('--bg-panel').trim() || '#1c212c';
  const foreground = rootStyles.getPropertyValue('--text').trim() || '#e6e6e6';
  const accent = rootStyles.getPropertyValue('--accent').trim() || '#3b82f6';
  const base = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  const ansiPalette: Pick<
    ITheme,
    | 'black'
    | 'red'
    | 'green'
    | 'yellow'
    | 'blue'
    | 'magenta'
    | 'cyan'
    | 'white'
    | 'brightBlack'
    | 'brightRed'
    | 'brightGreen'
    | 'brightYellow'
    | 'brightBlue'
    | 'brightMagenta'
    | 'brightCyan'
    | 'brightWhite'
  > =
    base === 'light'
      ? {
          black: '#0f172a',
          red: '#b91c1c',
          green: '#047857',
          yellow: '#7a5c00',
          blue: '#1d4ed8',
          magenta: '#a21caf',
          cyan: '#0e7490',
          white: '#334155',
          brightBlack: '#64748b',
          brightRed: '#dc2626',
          brightGreen: '#059669',
          brightYellow: '#8a6b00',
          brightBlue: '#2563eb',
          brightMagenta: '#c026d3',
          brightCyan: '#0891b2',
          brightWhite: '#0f172a'
        }
      : {
          black: '#111827',
          red: '#f87171',
          green: '#34d399',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#e5e7eb',
          brightBlack: '#9ca3af',
          brightRed: '#fecaca',
          brightGreen: '#a7f3d0',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#ddd6fe',
          brightCyan: '#a5f3fc',
          brightWhite: '#f9fafb'
        };

  return {
    background,
    foreground,
    cursorAccent: background,
    cursor: accent,
    selectionBackground: withAlpha(accent, 0.28),
    selectionInactiveBackground: withAlpha(accent, 0.16),
    ...ansiPalette
  };
}
