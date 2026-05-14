import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        qs: {
          bronze: {
            900: 'var(--qs-bronze-900)',
            800: 'var(--qs-bronze-800)',
            700: 'var(--qs-bronze-700)',
            600: 'var(--qs-bronze-600)',
            500: 'var(--qs-bronze-500)',
            400: 'var(--qs-bronze-400)',
            300: 'var(--qs-bronze-300)'
          },
          gold: {
            700: 'var(--qs-gold-700)',
            600: 'var(--qs-gold-600)',
            500: 'var(--qs-gold-500)',
            400: 'var(--qs-gold-400)',
            300: 'var(--qs-gold-300)',
            200: 'var(--qs-gold-200)',
            100: 'var(--qs-gold-100)'
          },
          ink: {
            1000: 'var(--qs-ink-1000)',
            900: 'var(--qs-ink-900)',
            800: 'var(--qs-ink-800)',
            700: 'var(--qs-ink-700)',
            600: 'var(--qs-ink-600)',
            500: 'var(--qs-ink-500)'
          },
          stone: {
            700: 'var(--qs-stone-700)',
            600: 'var(--qs-stone-600)',
            500: 'var(--qs-stone-500)',
            400: 'var(--qs-stone-400)',
            300: 'var(--qs-stone-300)',
            200: 'var(--qs-stone-200)',
            100: 'var(--qs-stone-100)'
          },
          success: 'var(--qs-success)',
          warning: 'var(--qs-warning)',
          danger: 'var(--qs-danger)',
          info: 'var(--qs-info)'
        },
        // Semantic aliases (read role tokens; flip automatically in dark mode)
        bg: {
          DEFAULT: 'var(--qs-bg)',
          elev: 'var(--qs-bg-elev)',
          sunken: 'var(--qs-bg-sunken)',
          inverse: 'var(--qs-bg-inverse)',
          // Legacy aliases retained during the v0.5 cutover so un-restyled surfaces stay readable
          page: 'var(--qs-bg)',
          panel: 'var(--qs-bg-elev)',
          'panel-2': 'var(--qs-bg-sunken)',
          header: 'var(--qs-bg)'
        },
        fg: {
          DEFAULT: 'var(--qs-fg-1)',
          muted: 'var(--qs-fg-2)',
          subtle: 'var(--qs-fg-3)',
          faint: 'var(--qs-fg-4)',
          brand: 'var(--qs-fg-brand)',
          accent: 'var(--qs-fg-accent)',
          inverse: 'var(--qs-fg-inverse)'
        },
        line: {
          DEFAULT: 'var(--qs-border-1)',
          strong: 'var(--qs-border-2)',
          stronger: 'var(--qs-border-3)',
          brand: 'var(--qs-border-brand)'
        },
        // Legacy aliases kept so untouched components don't break mid-migration
        primary: {
          DEFAULT: 'var(--qs-fg-brand)',
          strong: 'var(--qs-gold-600)',
          contrast: 'var(--qs-ink-900)'
        },
        danger: 'var(--qs-danger)',
        success: 'var(--qs-success)',
        warn: 'var(--qs-warning)'
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'Segoe UI', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
      },
      borderRadius: {
        DEFAULT: '8px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '18px',
        xl: '24px',
        '2xl': '32px',
        pill: '999px'
      },
      boxShadow: {
        'qs-xs': 'var(--qs-shadow-xs)',
        'qs-sm': 'var(--qs-shadow-sm)',
        'qs-md': 'var(--qs-shadow-md)',
        'qs-lg': 'var(--qs-shadow-lg)',
        'qs-xl': 'var(--qs-shadow-xl)',
        'qs-glow': 'var(--qs-shadow-glow)',
        'qs-inset': 'var(--qs-shadow-inset)',
        // Legacy shadow alias for un-restyled surfaces during the v0.5 cutover
        premium: 'var(--qs-shadow-md)',
        card: 'var(--qs-shadow-xs)',
        glow: 'var(--qs-shadow-glow)',
        'glow-lg': 'var(--qs-shadow-lg)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } }
      },
      animation: {
        'fade-in': 'fade-in 220ms cubic-bezier(0.16,1,0.3,1)'
      }
    }
  },
  plugins: []
} satisfies Config;
