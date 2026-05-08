import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          contrast: 'var(--accent-contrast)'
        },
        bg: {
          page: 'var(--bg-page)',
          header: 'var(--bg-header)',
          panel: 'var(--bg-panel)',
          'panel-2': 'var(--bg-panel-2)',
          elev: 'var(--bg-elev)'
        },
        fg: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)'
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)'
        },
        danger: 'var(--danger)',
        success: 'var(--success)',
        warn: 'var(--warn)'
      },
      fontFamily: {
        display: ['Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
        sans: ['Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '6px',
        '2xl': '8px'
      },
      boxShadow: {
        glow: 'none',
        'glow-lg': 'none',
        premium: '0 4px 16px rgba(0, 0, 0, 0.4)',
        card: '0 1px 2px rgba(0, 0, 0, 0.2)'
      },
      backgroundImage: {
        'vibe-radial': 'none',
        'brand-gradient': 'none'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } }
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
