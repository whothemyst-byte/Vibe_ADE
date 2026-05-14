# Vibe-ADE v0.5 UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Vibe-ADE renderer to the QuanSynd dark brand and add four IA features (workspace modes, card-grid layout, Canvas mode, Tasks↔Agents↔Files mindmap), shipped as a single cutover v0.5.0 off branch `redesign/v0.5`.

**Architecture:** Renderer-only redesign except for two additive main-process changes: a `mode` field on `WorkspaceState` (defaults to `'space'`) and a new read-only `fileOwnership:list` IPC channel. Brand tokens are imported verbatim from `D:\Quansynd\vibeade\design\tokens.css`; Tailwind is rewired to read `--qs-*` CSS vars so existing `className` consumers inherit the new palette automatically. Per-screen layout matches the corresponding JSX in `D:\Quansynd\vibeade\design\src\`.

**Tech Stack:** Electron + React 18 + TypeScript + Vite, Tailwind CSS, Zustand, node-pty, xterm.js, react-resizable-panels (existing), react-rnd (new, Canvas), @xyflow/react (new, mindmap), Vitest, electron-builder NSIS+portable.

**Spec:** `docs/superpowers/specs/2026-05-14-vibe-ade-ui-redesign-design.md`

---

## Task 0: Create branch

**Files:**
- None (git operation only)

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Create and check out branch**

```bash
git checkout -b redesign/v0.5
```

- [ ] **Step 3: Push branch with upstream**

```bash
git push -u origin redesign/v0.5
```

---

## Task 1: Add font + UI libraries

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

Run: `npm install @fontsource/sora @fontsource/manrope react-rnd @xyflow/react`
Expected: dependencies added to `package.json` and `package-lock.json`; no peer-dep warnings that block install.

- [ ] **Step 2: Verify install**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(redesign): add Sora/Manrope fonts, react-rnd, @xyflow/react"
```

---

## Task 2: Drop in QuanSynd token sheet

**Files:**
- Create: `src/renderer/src/styles/tokens.css`

- [ ] **Step 1: Copy tokens verbatim**

Copy the entire contents of `D:\Quansynd\vibeade\design\tokens.css` to `src/renderer/src/styles/tokens.css`. Replace the `@import url("https://fonts.googleapis.com/...")` line at the top with a comment — fonts are loaded via `@fontsource/*` packages in `main.tsx`, not over the network:

```css
/* Webfonts loaded via @fontsource/sora, @fontsource/manrope, @fontsource/jetbrains-mono in main.tsx */
```

Everything else (`:root`, `[data-theme="dark"]`, `.qs-*` type utilities) stays identical.

- [ ] **Step 2: Verify file present**

Run: `node -e "console.log(require('fs').statSync('src/renderer/src/styles/tokens.css').size)"`
Expected: a number > 5000.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/styles/tokens.css
git commit -m "feat(redesign): add QuanSynd design tokens"
```

---

## Task 3: Wire tokens into renderer entry + html

**Files:**
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/styles/app.css`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Switch fontsource imports in main.tsx**

In `src/renderer/src/main.tsx`, replace any `@fontsource/inter` imports with:

```ts
import '@fontsource/sora/400.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
```

- [ ] **Step 2: Import tokens.css first in app.css**

Prepend to `src/renderer/src/styles/app.css`:

```css
@import './tokens.css';
```

Below that, replace any existing `body { font-family: ... }` and `body { background: ... }` declarations so they read:

```css
html, body {
  background: var(--qs-bg);
  color: var(--qs-fg-1);
  font-family: var(--qs-font-text);
}
```

Leave the existing `@tailwind base; @tailwind components; @tailwind utilities;` lines in place after the import.

- [ ] **Step 3: Force dark theme in index.html**

In `src/renderer/index.html`, change the `<html lang="en">` tag to `<html lang="en" data-theme="dark">`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/main.tsx src/renderer/src/styles/app.css src/renderer/index.html
git commit -m "feat(redesign): load QuanSynd tokens + Sora/Manrope fonts, force dark theme"
```

---

## Task 4: Rewire Tailwind to QuanSynd vars

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace Tailwind config**

Replace the entire contents of `tailwind.config.ts` with:

```ts
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
          inverse: 'var(--qs-bg-inverse)'
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
        'qs-inset': 'var(--qs-shadow-inset)'
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke-launch dev**

Run: `npm run dev` (in another shell), wait for window to open, confirm background is `#14110B` ink, text is cream/manrope, no console errors. Close.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(redesign): rewire Tailwind to QuanSynd CSS vars"
```

---

## Task 5: Hex-value cleanup pass

**Files:**
- Modify: any `src/renderer/src/**/*.tsx` or `*.css` containing literal hex colors

- [ ] **Step 1: Find hex literals in renderer**

Run (PowerShell):
```powershell
Select-String -Path 'src/renderer/src/**/*.tsx','src/renderer/src/**/*.css' -Pattern '#[0-9A-Fa-f]{3,8}' -AllMatches | Group-Object Path | Select-Object Count, Name
```
Expected: a list of files containing hex literals. Open each.

- [ ] **Step 2: Replace each hex with the nearest QuanSynd token**

Mapping table — use these for the common cases:

| Old | Replace with |
|---|---|
| `#000`, `#111`, `#0E0B07` | `var(--qs-ink-1000)` |
| `#14110B`, `#1A1A1A` | `var(--qs-ink-900)` |
| `#1F1A11`, `#222`, `#2A2A2A` | `var(--qs-ink-800)` |
| `#2A2418`, `#333` | `var(--qs-ink-700)` |
| `#F4ECD9`, `#FAF6EE`, `#FFF` (text on dark) | `var(--qs-cream-50)` |
| `#B8B0A0`, `#9D9484` | `var(--qs-stone-400)` / `var(--qs-stone-500)` |
| `#D79A3D`, `#FFD700`, `#FFC107` | `var(--qs-gold-500)` |
| `#7A4F10`, accents | `var(--qs-bronze-600)` |
| `#2F7D52`, success greens | `var(--qs-success)` |
| `#B53D2C`, danger reds | `var(--qs-danger)` |

In `.tsx` use inline `style={{ color: 'var(--qs-...)'}}` only if a Tailwind class doesn't fit; prefer the class form (`text-fg-accent`, `bg-bg-elev`, `border-line`).

- [ ] **Step 3: Re-scan**

Run the Step 1 command again.
Expected: only intentional hex literals remain (e.g., terminal ANSI color tables in `TerminalPane.tsx`, splash backgrounds with brand-gradient stops). Note any survivors in the commit message.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src
git commit -m "refactor(redesign): replace ad-hoc hex literals with QuanSynd tokens"
```

---

## Task 6: Set xterm.js theme to QuanSynd gold cursor

**Files:**
- Modify: `src/renderer/src/components/TerminalPane.tsx` (or wherever `new Terminal({ theme: ... })` is constructed)

- [ ] **Step 1: Locate xterm theme**

Run (PowerShell):
```powershell
Select-String -Path 'src/renderer/src/**/*.ts','src/renderer/src/**/*.tsx' -Pattern 'new Terminal\(' -Context 0,30
```
Identify the `theme: { ... }` object passed to the xterm constructor.

- [ ] **Step 2: Replace theme**

Replace the theme object with:

```ts
theme: {
  background: '#14110B',
  foreground: '#F4ECD9',
  cursor: '#D79A3D',
  cursorAccent: '#14110B',
  selectionBackground: 'rgba(215,154,61,0.25)',
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
}
```

Note: xterm.js does not resolve CSS variables — hex literals are required here.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Smoke-verify**

Run: `npm run dev`, open a workspace, type `dir` in a terminal pane.
Expected: gold blinking cursor on ink background, cream output text.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TerminalPane.tsx
git commit -m "feat(redesign): apply QuanSynd palette to xterm.js theme"
```

---

## Task 7: Restyle AuthScreen

**Files:**
- Modify: `src/renderer/src/components/AuthScreen.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\auth.jsx`

- [ ] **Step 1: Read both files**

Open `src/renderer/src/components/AuthScreen.tsx` and `D:\Quansynd\vibeade\design\src\auth.jsx`. Identify these structural elements in the reference: centered card on ink-900, gradient "QS" logomark, Sign In / Create Account segmented control, email + password fields with Lucide `Mail` + `Lock` left-icons, gold Sign In button, optional OAuth-style row below.

- [ ] **Step 2: Restyle the existing component**

Keep the existing form logic, `AuthManager` calls, error state, and validation EXACTLY as-is. Only change the JSX wrapper, classNames, and add Lucide icons. Target structure:

```tsx
<div className="min-h-screen w-full grid place-items-center bg-bg">
  <div className="w-[420px] bg-bg-elev rounded-lg border border-line shadow-qs-lg p-8">
    <div className="flex flex-col items-center gap-4 mb-6">
      <div className="w-12 h-12 rounded-md bg-gradient-to-br from-qs-gold-500 to-qs-bronze-400 grid place-items-center text-qs-ink-900 font-display font-bold text-xl">QS</div>
      <h1 className="font-display text-2xl text-fg">Welcome to Vibe-ADE</h1>
      <p className="text-sm text-fg-muted">Sign in to sync workspaces across machines.</p>
    </div>
    {/* segmented control: signin | signup — bind to existing mode state */}
    {/* form fields with Mail / Lock icons via lucide-react */}
    {/* primary button: bg-fg-accent text-qs-ink-900 hover:bg-qs-gold-400 */}
  </div>
</div>
```

Do NOT add new state, new IPC calls, or new validation rules.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Visual + functional verify**

Run: `npm run dev`. Sign out if signed in. Confirm: card centered, gold logomark, segmented control toggles between Sign In and Create Account, both flows reach success (use real Supabase credentials or the existing test account).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AuthScreen.tsx
git commit -m "feat(redesign): restyle AuthScreen to QuanSynd"
```

---

## Task 8: Restyle StartPage (token sweep only)

**Files:**
- Modify: `src/renderer/src/components/StartPage.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\start.jsx`, `D:\Quansynd\vibeade\design\src\start-content.jsx`

- [ ] **Step 1: Apply token sweep**

Restyle existing rows ("New Workspace", "New Swarm", "Open Environment") using QuanSynd tokens. Each row is a `bg-bg-elev rounded-md border border-line p-4 hover:border-line-strong` card with a leading icon, title (`font-display font-semibold text-fg`), description (`text-sm text-fg-muted`), and a chevron-right.

Do NOT add the three mode-cards hero yet — that lands in Task 16. Existing onClick handlers and routing stay unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Visual verify**

Run: `npm run dev`, reach Start page. Confirm rows render with new style and all three buttons open their respective overlays.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/StartPage.tsx
git commit -m "feat(redesign): restyle StartPage rows (hero deferred to mode work)"
```

---

## Task 9: Restyle workspace shell chrome

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/WorkspaceSidebar.tsx`
- Modify: `src/renderer/src/components/WorkspaceTabs.tsx`
- Modify: `src/renderer/src/components/AppMenuBar.tsx`
- Modify: `src/renderer/src/components/WorkspaceExplorerRail.tsx` (if present)
- Reference: `D:\Quansynd\vibeade\design\src\shell.jsx`, `D:\Quansynd\vibeade\design\src\workspace.jsx`

- [ ] **Step 1: Restyle left rail (WorkspaceSidebar)**

Width 56px, `bg-bg-sunken border-r border-line`. Workspace entries are 40×40 rounded-md cards (`bg-bg-elev` for inactive, `bg-fg-accent text-qs-ink-900` for active). Footer: Customize button + light/dark toggle (`Sun`/`Moon` from lucide-react, toggles `document.documentElement.dataset.theme`).

- [ ] **Step 2: Restyle titlebar (AppMenuBar)**

Top 40px row, `bg-bg border-b border-line`. Left cluster: back/forward chevrons, sidebar toggle. Center: search input (`bg-bg-sunken border border-line rounded-md placeholder:text-fg-faint`). Right: window controls (preserve existing minimize/maximize/close handlers).

- [ ] **Step 3: Restyle workspace tabs**

`WorkspaceTabs.tsx`: `bg-bg-elev` strip, each tab `px-3 py-1.5 rounded-sm text-sm font-medium`. Active tab `bg-bg text-fg`, inactive `text-fg-muted hover:text-fg`.

- [ ] **Step 4: Add status bar**

If a status bar component already exists, restyle it. If not, add `src/renderer/src/components/WorkspaceStatusBar.tsx`:

```tsx
import { useWorkspaceStore } from '../state/workspaceStore';

export function WorkspaceStatusBar() {
  const activeWs = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId));
  const taskCount = activeWs?.tasks?.length ?? 0;
  return (
    <div className="h-7 px-3 flex items-center gap-4 bg-bg-sunken border-t border-line text-xs text-fg-muted font-mono">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-qs-success" />
        Online
      </span>
      <span>{taskCount} task{taskCount === 1 ? '' : 's'}</span>
      <span className="ml-auto truncate">{activeWs?.rootDir ?? ''}</span>
    </div>
  );
}
```

Mount it at the bottom of the workspace shell in `App.tsx`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Visual verify**

Run: `npm run dev`, open a workspace. Confirm rail, titlebar, tabs, status bar all match design tokens; navigation between workspaces works.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/WorkspaceSidebar.tsx src/renderer/src/components/WorkspaceTabs.tsx src/renderer/src/components/AppMenuBar.tsx src/renderer/src/components/WorkspaceStatusBar.tsx
git commit -m "feat(redesign): restyle workspace shell — rail, titlebar, tabs, status bar"
```

---

## Task 10: Restyle TerminalPane chrome

**Files:**
- Modify: `src/renderer/src/components/TerminalPane.tsx`
- Modify: `src/renderer/src/components/PaneLayout.tsx`
- Modify: `src/renderer/src/components/TerminalActionMenu.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\workspace.jsx`

- [ ] **Step 1: Restyle pane header**

Each terminal pane gets a 32px header strip: `bg-bg-elev border-b border-line px-3 flex items-center gap-2 text-xs`.

Contents, left to right:
- Status dot — `w-2 h-2 rounded-full bg-qs-success` (running) / `bg-qs-stone-500` (idle).
- Pane title — `font-mono text-fg-muted truncate` showing `${shellType} · ${cwd}`.
- Spacer (`flex-1`).
- Globe icon (Lucide `Globe`) — opens browser pane (existing handler).
- Menu icon (Lucide `MoreVertical`) — opens `TerminalActionMenu` (existing handler).

- [ ] **Step 2: Restyle pane body**

Outer container: `bg-bg rounded-md border border-line overflow-hidden`. Add `data-active={isActive}` and target it in CSS: active panes get `border-line-brand shadow-qs-glow`.

- [ ] **Step 3: Restyle TerminalActionMenu**

Popover: `bg-bg-elev border border-line rounded-md shadow-qs-lg py-1`. Items: `px-3 py-1.5 text-sm text-fg hover:bg-bg-sunken`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Functional verify**

Run: `npm run dev`. Confirm: PTY I/O works, split-tree shortcuts still work, active pane border highlights, action menu opens.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/TerminalPane.tsx src/renderer/src/components/PaneLayout.tsx src/renderer/src/components/TerminalActionMenu.tsx
git commit -m "feat(redesign): restyle TerminalPane header, body, action menu"
```

---

## Task 11: Restyle TaskBoard

**Files:**
- Modify: `src/renderer/src/components/TaskBoard.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\taskboard.jsx`

- [ ] **Step 1: Restyle columns**

Three columns side-by-side, each `flex-1 bg-bg-elev rounded-md border border-line p-4 flex flex-col gap-3`. Column header: `font-display text-md font-semibold text-fg` + count chip (`text-xs px-2 py-0.5 rounded-pill bg-bg-sunken text-fg-muted`).

- [ ] **Step 2: Restyle task cards**

Each task: `bg-bg rounded-sm border border-line p-3 hover:border-line-strong cursor-grab`. Title `text-sm font-medium text-fg`, meta row `text-xs text-fg-muted font-mono`. Preserve dnd-kit drag handlers.

- [ ] **Step 3: Restyle toolbar**

Top row: search input (same styling as titlebar search) + `+ New Task` button (`bg-fg-accent text-qs-ink-900 hover:bg-qs-gold-400 px-3 py-1.5 rounded-sm text-sm font-medium`).

- [ ] **Step 4: Restyle empty state**

`text-fg-faint text-sm italic` centered: `No tasks yet.`

- [ ] **Step 5: Typecheck + verify**

Run: `npm run typecheck` (expect PASS), then `npm run dev`. Confirm: create/edit/delete tasks works, drag between columns works.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/TaskBoard.tsx
git commit -m "feat(redesign): restyle TaskBoard columns, cards, toolbar"
```

---

## Task 12: Restyle SwarmBoard surfaces

**Files:**
- Modify: `src/renderer/src/components/SwarmBoard.tsx`
- Modify: `src/renderer/src/components/SwarmDashboardDialog.tsx`
- Modify: `src/renderer/src/components/SwarmSessionView.tsx`
- Modify: `src/renderer/src/components/SwarmTerminalView.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\swarm.jsx`

- [ ] **Step 1: Restyle SwarmBoard list**

Container `bg-bg`, each session card `bg-bg-elev border border-line rounded-md p-4`. Status chip: rounded-pill, `bg-qs-success/15 text-qs-success` (running), `bg-qs-stone-500/15 text-fg-muted` (idle), `bg-qs-danger/15 text-qs-danger` (error).

- [ ] **Step 2: Restyle SwarmDashboardDialog**

Modal: `bg-bg-elev border border-line rounded-lg shadow-qs-xl p-6 max-w-3xl`.

- [ ] **Step 3: Restyle SwarmSessionView + SwarmTerminalView**

Agent transcripts use `font-mono text-sm text-fg`. Agent role tags: `text-xs px-2 py-0.5 rounded-pill border border-line-brand text-fg-accent`.

- [ ] **Step 4: Typecheck + verify**

Run: `npm run typecheck` (PASS). Run: `npm run dev`. Spin up a swarm session (or open an existing recording); confirm transcripts readable, status chips render, dialog opens/closes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SwarmBoard.tsx src/renderer/src/components/SwarmDashboardDialog.tsx src/renderer/src/components/SwarmSessionView.tsx src/renderer/src/components/SwarmTerminalView.tsx
git commit -m "feat(redesign): restyle SwarmBoard, dashboard, session views"
```

---

## Task 13: Restyle BrowserPane

**Files:**
- Modify: `src/renderer/src/components/BrowserPane.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\browser.jsx`

- [ ] **Step 1: Restyle URL bar + nav**

Header strip mirrors `TerminalPane` chrome (Task 10): 32px tall, `bg-bg-elev border-b border-line`. Left: back / forward / reload buttons (Lucide chevrons + `RotateCw`, all `text-fg-muted hover:text-fg`). Center: URL input `flex-1 bg-bg-sunken border border-line rounded-sm px-3 py-1 text-sm font-mono text-fg placeholder:text-fg-faint`. Right: globe icon to toggle external open.

- [ ] **Step 2: Restyle tab strip (if present)**

`bg-bg-sunken border-b border-line`, each tab `px-3 py-1 rounded-sm text-xs font-medium`. Active `bg-bg text-fg`, others `text-fg-muted`.

- [ ] **Step 3: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Navigate to `https://example.com` in a browser pane; confirm load, back/forward work.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/BrowserPane.tsx
git commit -m "feat(redesign): restyle BrowserPane URL bar + tabs"
```

---

## Task 14: Restyle Settings dialog

**Files:**
- Modify: `src/renderer/src/components/SettingsDialog.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\settings.jsx`

- [ ] **Step 1: Restyle dialog shell**

`bg-bg-elev border border-line rounded-lg shadow-qs-xl w-[920px] max-h-[80vh] flex flex-col`. Header (`px-6 py-4 border-b border-line`): title `font-display text-xl text-fg` + close button.

- [ ] **Step 2: Restyle tab strip**

Top tabs: Appearance, Shortcuts, Environments, Task Board, Account. `px-4 py-2 text-sm font-medium border-b-2`. Active `border-fg-accent text-fg`, inactive `border-transparent text-fg-muted hover:text-fg`.

- [ ] **Step 3: Restyle Appearance pane**

Two sub-sections:
- **Theme Color**: row of 5 swatches (gold, bronze, slate, emerald, rose). Each `w-10 h-10 rounded-sm border-2`. Selected gets `border-fg-accent`, others `border-transparent`. For v0.5.0, all five swatches set the same gold palette — these are placeholders for a future palette-switcher; keep that comment in code.
- **Interface Theme**: three cards (System / Dark / Light), `w-40 h-24 rounded-md border border-line p-3 cursor-pointer hover:border-line-strong`. Selected gets `border-fg-accent`. onClick sets `document.documentElement.dataset.theme`.

- [ ] **Step 4: Restyle Environments, Account, Task Board, Shortcuts panes**

Token sweep only — keep existing controls, swap classNames to the conventions used in earlier tasks (inputs `bg-bg-sunken border border-line`, labels `text-sm font-medium text-fg`, helper text `text-xs text-fg-muted`).

- [ ] **Step 5: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Open Settings, click through each tab, toggle theme cards. Confirm all controls still wired to existing state.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/SettingsDialog.tsx
git commit -m "feat(redesign): restyle Settings dialog tabs + appearance pane"
```

---

## Task 15: Restyle overlays, toast, error boundary

**Files:**
- Modify: `src/renderer/src/components/CreateFlowOverlay.tsx`
- Modify: `src/renderer/src/components/CreateWorkspaceForm.tsx`
- Modify: `src/renderer/src/components/OpenEnvironmentOverlay.tsx`
- Modify: `src/renderer/src/components/Toast.tsx`
- Modify: `src/renderer/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Restyle modals**

All overlays use the same shell: `bg-bg-elev border border-line rounded-lg shadow-qs-xl p-6`. Backdrop: `bg-qs-ink-1000/70 backdrop-blur-sm`.

- [ ] **Step 2: Restyle form fields**

Labels `text-sm font-medium text-fg mb-1.5`. Inputs `w-full bg-bg-sunken border border-line rounded-sm px-3 py-2 text-sm text-fg focus:outline-none focus:border-line-brand focus:shadow-qs-glow`. Primary button `bg-fg-accent text-qs-ink-900 hover:bg-qs-gold-400`. Secondary button `bg-bg-sunken text-fg border border-line hover:border-line-strong`.

- [ ] **Step 3: Restyle Toast**

Container `bg-bg-elev border border-line rounded-md shadow-qs-md px-4 py-3 text-sm text-fg`. Success variant adds `border-l-2 border-l-qs-success`; danger `border-l-qs-danger`.

- [ ] **Step 4: Restyle ErrorBoundary**

Full-screen `bg-bg grid place-items-center`. Card with `font-display text-2xl text-fg` heading and `text-fg-muted` description. Reload button uses primary button style.

- [ ] **Step 5: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Trigger: create workspace, open environment, toast (delete a task), error boundary (temporarily throw in a component, then revert). Confirm visuals.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/CreateFlowOverlay.tsx src/renderer/src/components/CreateWorkspaceForm.tsx src/renderer/src/components/OpenEnvironmentOverlay.tsx src/renderer/src/components/Toast.tsx src/renderer/src/components/ErrorBoundary.tsx
git commit -m "feat(redesign): restyle overlays, toast, error boundary"
```

---

## Task 16: Add `mode` field to WorkspaceState (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/WorkspaceManager.ts`
- Test: `tests/main/WorkspaceManager.mode.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/main/WorkspaceManager.mode.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager } from '../../src/main/services/WorkspaceManager';

describe('WorkspaceManager mode field', () => {
  let mgr: WorkspaceManager;
  beforeEach(() => { mgr = new WorkspaceManager({ storagePath: ':memory:' } as any); });

  it('defaults legacy workspace (no mode field) to "space"', async () => {
    const legacy = {
      id: 'ws-1', name: 'legacy', rootDir: 'C:/tmp',
      layout: { id: 'l', type: 'pane', paneId: 'p1' } as const,
      paneTypes: { p1: 'terminal' }, paneShells: { p1: 'powershell' },
      browserPanes: {}, activePaneId: 'p1', commandBlocks: {}, tasks: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
    };
    const migrated = (mgr as any).migrateWorkspace(legacy);
    expect(migrated.mode).toBe('space');
  });

  it('preserves explicit mode on already-migrated workspace', () => {
    const ws = { /* …same as above… */ mode: 'canvas' as const,
      id: 'ws-2', name: 'c', rootDir: 'C:/tmp',
      layout: { id: 'l', type: 'pane', paneId: 'p1' } as const,
      paneTypes: { p1: 'terminal' }, paneShells: { p1: 'powershell' },
      browserPanes: {}, activePaneId: 'p1', commandBlocks: {}, tasks: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
    };
    const migrated = (mgr as any).migrateWorkspace(ws);
    expect(migrated.mode).toBe('canvas');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/main/WorkspaceManager.mode.test.ts`
Expected: FAIL (`migrateWorkspace is not a function` or `mode` property absent).

- [ ] **Step 3: Add `mode` to type**

In `src/shared/types.ts`, change `WorkspaceState` to add the field after `tasks`:

```ts
export type WorkspaceMode = 'space' | 'swarm' | 'canvas';

export interface WorkspaceState {
  id: WorkspaceId;
  name: string;
  rootDir: string;
  layout: LayoutNode;
  paneTypes: Record<PaneId, PaneType>;
  paneShells: Record<PaneId, ShellType>;
  browserPanes: Record<PaneId, BrowserPaneState>;
  activePaneId: PaneId;
  commandBlocks: Record<PaneId, CommandBlock[]>;
  tasks: TaskItem[];
  mode: WorkspaceMode;
  canvas?: CanvasState;       // populated only when mode === 'canvas'
  createdAt: string;
  updatedAt: string;
}

export interface CanvasState {
  transform: { x: number; y: number; scale: number };
  cards: Record<PaneId, { x: number; y: number; w: number; h: number }>;
}
```

- [ ] **Step 4: Add migration in WorkspaceManager**

In `src/main/services/WorkspaceManager.ts`, add a private migration helper called from `loadWorkspaces()` (or whichever method reads from disk):

```ts
private migrateWorkspace(ws: any): WorkspaceState {
  return {
    ...ws,
    mode: ws.mode ?? 'space',
    canvas: ws.canvas // may be undefined; that's expected for non-canvas workspaces
  };
}
```

In the existing load loop, replace `workspaces.push(ws)` with `workspaces.push(this.migrateWorkspace(ws))`. Update `createWorkspace(input)` to accept optional `mode` and default it to `'space'`.

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run tests/main/WorkspaceManager.mode.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/services/WorkspaceManager.ts tests/main/WorkspaceManager.mode.test.ts
git commit -m "feat(redesign): add WorkspaceState.mode with backwards-compatible migration"
```

---

## Task 17: Extend workspace:create IPC to accept mode

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/workspaceHandlers.ts` (or the file currently handling `workspace:create`)
- Modify: `src/preload/index.ts` and `src/preload/global.d.ts` (if they re-declare the payload shape)

- [ ] **Step 1: Add mode to WorkspaceCreationInput**

In `src/shared/ipc.ts`:

```ts
import type { WorkspaceMode } from './types';

export interface WorkspaceCreationInput {
  name: string;
  rootDir: string;
  layoutPresetId?: string;
  templateId?: string;
  selectedModelId?: string;
  mode?: WorkspaceMode;   // NEW; defaults to 'space' in the main process
}
```

- [ ] **Step 2: Thread mode through handler**

In the `workspace:create` handler, pass `input.mode ?? 'space'` to `workspaceManager.createWorkspace(...)`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/workspaceHandlers.ts src/preload/index.ts src/preload/global.d.ts
git commit -m "feat(redesign): accept mode in workspace:create IPC"
```

---

## Task 18: Start page mode hero (three cards)

**Files:**
- Create: `src/renderer/src/components/WorkspaceModeCard.tsx`
- Modify: `src/renderer/src/components/StartPage.tsx`
- Modify: `src/renderer/src/components/CreateWorkspaceForm.tsx`
- Reference: `D:\Quansynd\vibeade\design\src\start.jsx`

- [ ] **Step 1: Create WorkspaceModeCard**

```tsx
import type { WorkspaceMode } from '@shared/types';
import { LayoutGrid, Users, Maximize2 } from 'lucide-react';

interface Props {
  mode: WorkspaceMode;
  selected: boolean;
  onClick: () => void;
}

const META: Record<WorkspaceMode, { icon: typeof LayoutGrid; title: string; sub: string }> = {
  space:  { icon: LayoutGrid, title: 'Space',  sub: 'Split-pane workspace for terminals + browser.' },
  swarm:  { icon: Users,      title: 'Swarm',  sub: 'Multi-agent coordination with shared task board.' },
  canvas: { icon: Maximize2,  title: 'Canvas', sub: 'Free-form board — drag terminals anywhere, pan and zoom.' }
};

export function WorkspaceModeCard({ mode, selected, onClick }: Props) {
  const { icon: Icon, title, sub } = META[mode];
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      className="text-left bg-bg-elev border border-line rounded-lg p-6 flex flex-col gap-3 hover:border-line-strong data-[selected=true]:border-line-brand data-[selected=true]:shadow-qs-glow transition-colors"
    >
      <Icon className="w-6 h-6 text-fg-accent" />
      <div className="font-display text-lg font-semibold text-fg">{title}</div>
      <div className="text-sm text-fg-muted">{sub}</div>
    </button>
  );
}
```

- [ ] **Step 2: Rewrite StartPage hero**

Above the existing rows, add a hero grid:

```tsx
<section className="px-12 py-10">
  <p className="qs-eyebrow mb-3">Get started</p>
  <h1 className="font-display text-3xl font-semibold text-fg mb-2">What are you building today?</h1>
  <p className="text-fg-muted mb-8">Pick a workspace mode — you can always switch by creating a new one.</p>
  <div className="grid grid-cols-3 gap-4">
    {(['space','swarm','canvas'] as WorkspaceMode[]).map((m) => (
      <WorkspaceModeCard key={m} mode={m} selected={selectedMode === m}
        onClick={() => { setSelectedMode(m); openCreateOverlay({ mode: m }); }} />
    ))}
  </div>
</section>
```

`selectedMode` is local `useState`; `openCreateOverlay` reuses the existing dispatcher with a new `mode` arg.

- [ ] **Step 3: Thread mode through CreateWorkspaceForm**

Accept `initialMode?: WorkspaceMode`, pass it into the `workspace:create` IPC call.

- [ ] **Step 4: Typecheck + verify**

Run: `npm run typecheck` (PASS). Run: `npm run dev`. From Start, click each of the three cards; confirm create overlay opens prefilled with that mode and creates a workspace with that `mode` value (check via `localStorage`/state inspector or a temporary `console.log`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/WorkspaceModeCard.tsx src/renderer/src/components/StartPage.tsx src/renderer/src/components/CreateWorkspaceForm.tsx
git commit -m "feat(redesign): Start hero with three workspace-mode cards"
```

---

## Task 19: Card-grid layout presets (TDD)

**Files:**
- Modify: `src/renderer/src/services/layoutPresets.ts`
- Modify: `src/renderer/src/components/LayoutSelector.tsx`
- Test: `tests/renderer/layoutPresets.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/renderer/layoutPresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGridPreset } from '../../src/renderer/src/services/layoutPresets';

function countPanes(node: any): number {
  if (node.type === 'pane') return 1;
  return node.children.reduce((acc: number, c: any) => acc + countPanes(c), 0);
}

describe('buildGridPreset', () => {
  it('2x1 yields 2 panes in a horizontal split', () => {
    const tree = buildGridPreset(2, 1, ['a','b']);
    expect(countPanes(tree)).toBe(2);
    expect(tree.type).toBe('split');
    expect((tree as any).direction).toBe('horizontal');
  });
  it('2x2 yields 4 panes (vertical of two horizontals)', () => {
    const tree = buildGridPreset(2, 2, ['a','b','c','d']);
    expect(countPanes(tree)).toBe(4);
    expect((tree as any).direction).toBe('vertical');
  });
  it('3x2 yields 6 panes', () => {
    const tree = buildGridPreset(3, 2, ['a','b','c','d','e','f']);
    expect(countPanes(tree)).toBe(6);
  });
  it('4x2 yields 8 panes', () => {
    const tree = buildGridPreset(4, 2, ['a','b','c','d','e','f','g','h']);
    expect(countPanes(tree)).toBe(8);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/renderer/layoutPresets.test.ts`
Expected: FAIL (`buildGridPreset` undefined).

- [ ] **Step 3: Implement buildGridPreset**

Append to `src/renderer/src/services/layoutPresets.ts`:

```ts
import type { LayoutNode, PaneId } from '@shared/types';

let _gridNodeSeq = 0;
const nid = (prefix: string) => `${prefix}-${++_gridNodeSeq}`;

export function buildGridPreset(cols: number, rows: number, paneIds: PaneId[]): LayoutNode {
  if (paneIds.length !== cols * rows) {
    throw new Error(`buildGridPreset: need ${cols * rows} paneIds, got ${paneIds.length}`);
  }
  const rowNodes: LayoutNode[] = [];
  for (let r = 0; r < rows; r++) {
    const rowPanes = paneIds.slice(r * cols, (r + 1) * cols).map<LayoutNode>((pid) => ({
      id: nid('p'), type: 'pane', paneId: pid
    }));
    rowNodes.push(
      rowPanes.length === 1
        ? rowPanes[0]
        : { id: nid('h'), type: 'split', direction: 'horizontal', sizes: Array(cols).fill(100 / cols), children: rowPanes }
    );
  }
  if (rowNodes.length === 1) return rowNodes[0];
  return { id: nid('v'), type: 'split', direction: 'vertical', sizes: Array(rows).fill(100 / rows), children: rowNodes };
}

export const GRID_PRESETS = [
  { id: 'grid-2x1', label: '2×1', cols: 2, rows: 1 },
  { id: 'grid-2x2', label: '2×2', cols: 2, rows: 2 },
  { id: 'grid-3x2', label: '3×2', cols: 3, rows: 2 },
  { id: 'grid-4x2', label: '4×2', cols: 4, rows: 2 }
];
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/renderer/layoutPresets.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Surface presets in LayoutSelector**

In `LayoutSelector.tsx`, add a "Grid" group below existing presets. Each button calls a renderer-side action that:
1. Spawns `cols * rows - currentPaneCount` new terminal panes via existing `terminal:spawn` IPC.
2. Replaces `workspace.layout` with `buildGridPreset(cols, rows, allPaneIds)`.
3. Calls `workspace:save`.

- [ ] **Step 6: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Apply each grid preset; confirm correct pane count and arrangement; close and reopen workspace, confirm grid persists.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/services/layoutPresets.ts src/renderer/src/components/LayoutSelector.tsx tests/renderer/layoutPresets.test.ts
git commit -m "feat(redesign): add 2x1/2x2/3x2/4x2 grid layout presets"
```

---

## Task 20: Canvas state slice + persistence

**Files:**
- Create: `src/renderer/src/state/slices/canvasSlice.ts`
- Modify: `src/renderer/src/state/workspaceStore.ts`

- [ ] **Step 1: Implement slice**

```ts
import type { StateCreator } from 'zustand';
import type { CanvasState, PaneId, WorkspaceId } from '@shared/types';

export interface CanvasSlice {
  setCanvasTransform: (wsId: WorkspaceId, t: CanvasState['transform']) => void;
  setCanvasCard: (wsId: WorkspaceId, paneId: PaneId, rect: { x: number; y: number; w: number; h: number }) => void;
  removeCanvasCard: (wsId: WorkspaceId, paneId: PaneId) => void;
}

export const createCanvasSlice: StateCreator<any, [], [], CanvasSlice> = (set, get) => ({
  setCanvasTransform: (wsId, transform) => set((s: any) => ({
    workspaces: s.workspaces.map((w: any) =>
      w.id !== wsId ? w :
        { ...w, canvas: { ...(w.canvas ?? { transform, cards: {} }), transform } }
    )
  })),
  setCanvasCard: (wsId, paneId, rect) => set((s: any) => ({
    workspaces: s.workspaces.map((w: any) => {
      if (w.id !== wsId) return w;
      const canvas = w.canvas ?? { transform: { x: 0, y: 0, scale: 1 }, cards: {} };
      return { ...w, canvas: { ...canvas, cards: { ...canvas.cards, [paneId]: rect } } };
    })
  })),
  removeCanvasCard: (wsId, paneId) => set((s: any) => ({
    workspaces: s.workspaces.map((w: any) => {
      if (w.id !== wsId || !w.canvas) return w;
      const { [paneId]: _drop, ...rest } = w.canvas.cards;
      return { ...w, canvas: { ...w.canvas, cards: rest } };
    })
  }))
});
```

- [ ] **Step 2: Compose slice into workspaceStore**

In `workspaceStore.ts`, merge `createCanvasSlice(...)` into the existing store factory. Ensure all three actions trigger the existing `workspace:save` debounce already used for layout/pane changes.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/state/slices/canvasSlice.ts src/renderer/src/state/workspaceStore.ts
git commit -m "feat(redesign): add canvas state slice with persistence"
```

---

## Task 21: CanvasLayout + CanvasCard components

**Files:**
- Create: `src/renderer/src/components/CanvasCard.tsx`
- Create: `src/renderer/src/components/CanvasLayout.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: CanvasCard**

```tsx
import { Rnd } from 'react-rnd';
import { TerminalPane } from './TerminalPane';
import type { PaneId } from '@shared/types';

interface Props {
  paneId: PaneId;
  rect: { x: number; y: number; w: number; h: number };
  onChange: (rect: { x: number; y: number; w: number; h: number }) => void;
}

export function CanvasCard({ paneId, rect, onChange }: Props) {
  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.w, height: rect.h }}
      position={{ x: rect.x, y: rect.y }}
      onDragStop={(_, d) => onChange({ ...rect, x: d.x, y: d.y })}
      onResizeStop={(_, __, ref, ___, pos) =>
        onChange({ x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })
      }
      minWidth={320}
      minHeight={200}
      className="bg-bg-elev border border-line rounded-md shadow-qs-lg overflow-hidden"
    >
      <TerminalPane paneId={paneId} />
    </Rnd>
  );
}
```

- [ ] **Step 2: CanvasLayout**

```tsx
import { useRef, useState, WheelEvent, MouseEvent } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import { CanvasCard } from './CanvasCard';

export function CanvasLayout() {
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId));
  const setTransform = useWorkspaceStore((s) => s.setCanvasTransform);
  const setCard = useWorkspaceStore((s) => s.setCanvasCard);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  if (!ws) return null;
  const canvas = ws.canvas ?? { transform: { x: 0, y: 0, scale: 1 }, cards: {} };
  const { x, y, scale } = canvas.transform;

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const next = Math.min(2, Math.max(0.25, scale - e.deltaY * 0.001));
    setTransform(ws.id, { x, y, scale: next });
  };
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 1 && !e.altKey) return;
    setPanning(true);
    dragRef.current = { x: e.clientX - x, y: e.clientY - y };
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!panning || !dragRef.current) return;
    setTransform(ws.id, { x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y, scale });
  };
  const onMouseUp = () => { setPanning(false); dragRef.current = null; };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-bg-sunken"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}
      >
        {Object.entries(canvas.cards).map(([paneId, rect]) => (
          <CanvasCard key={paneId} paneId={paneId} rect={rect}
            onChange={(r) => setCard(ws.id, paneId, r)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Branch on mode in App.tsx**

In `App.tsx`, where the active workspace is rendered:

```tsx
{activeWs?.mode === 'canvas'
  ? <CanvasLayout />
  : <PaneLayout layout={activeWs.layout} />}
```

When a new terminal pane is spawned while `mode === 'canvas'`, auto-seed its rect: `{ x: 40 + n*60, y: 40 + n*60, w: 480, h: 320 }` where `n` is the current card count. Add this in the same place that currently mutates `workspace.layout` to include a new pane.

- [ ] **Step 4: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Create a Canvas-mode workspace from Start. Spawn 2 terminal panes. Drag and resize each. Alt-drag to pan. Ctrl+wheel to zoom. Close workspace, reopen. Confirm transform + card positions persisted.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/CanvasCard.tsx src/renderer/src/components/CanvasLayout.tsx src/renderer/src/App.tsx
git commit -m "feat(redesign): Canvas mode — free-form pan/zoom terminal cards"
```

---

## Task 22: fileOwnership:list IPC (TDD)

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/swarmHandlers.ts` (or a new `fileOwnershipHandlers.ts` if cleaner)
- Modify: `src/preload/index.ts`, `src/preload/global.d.ts`
- Test: `tests/main/fileOwnershipHandler.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/main/fileOwnershipHandler.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FileOwnershipManager } from '../../src/main/services/FileOwnershipManager';
import { buildFileOwnershipSnapshot } from '../../src/main/ipc/fileOwnershipHandlers';

describe('buildFileOwnershipSnapshot', () => {
  beforeEach(() => { (FileOwnershipManager as any).instance = undefined; });

  it('returns empty snapshot when nothing is owned', () => {
    const snap = buildFileOwnershipSnapshot();
    expect(snap.byFile).toEqual({});
    expect(snap.byTask).toEqual({});
  });

  it('returns owners by file + files by task after assignment', async () => {
    const mgr = FileOwnershipManager.getInstance();
    await mgr.assignFilesToTask(
      { id: 't1', requestedFiles: ['a.ts', 'b.ts'] } as any,
      'agent-1'
    );
    const snap = buildFileOwnershipSnapshot();
    expect(snap.byFile['a.ts']).toBe('agent-1');
    expect(snap.byFile['b.ts']).toBe('agent-1');
    expect(snap.byTask['t1'].sort()).toEqual(['a.ts','b.ts']);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/main/fileOwnershipHandler.test.ts`
Expected: FAIL (`buildFileOwnershipSnapshot` not exported).

- [ ] **Step 3: Implement handler**

Create `src/main/ipc/fileOwnershipHandlers.ts`:

```ts
import { ipcMain } from 'electron';
import { FileOwnershipManager } from '../services/FileOwnershipManager';

export interface FileOwnershipSnapshot {
  byFile: Record<string, string>;          // filePath -> agentId
  byTask: Record<string, string[]>;        // taskId  -> filePaths
}

export function buildFileOwnershipSnapshot(): FileOwnershipSnapshot {
  const mgr = FileOwnershipManager.getInstance();
  const allFiles = mgr.getAllOwnedFiles();           // Map<filePath, agentId>
  const byFile: Record<string, string> = {};
  for (const [f, owner] of allFiles.entries()) byFile[f] = owner;

  const byTask: Record<string, string[]> = {};
  for (const taskId of (mgr as any).taskFileMap.keys()) {
    byTask[taskId] = Array.from(mgr.getFilesOwnedByTask(taskId));
  }
  return { byFile, byTask };
}

export function registerFileOwnershipHandlers(): void {
  ipcMain.handle('fileOwnership:list', () => buildFileOwnershipSnapshot());
}
```

Note: `taskFileMap` is private — we read its keys via `(mgr as any)` rather than adding a new public method, keeping the surface change minimal. If a public accessor is preferred, add `public getKnownTaskIds(): string[]` to `FileOwnershipManager` and use it here.

Call `registerFileOwnershipHandlers()` from wherever existing handlers are registered (probably `registerIpcHandlers.ts`).

- [ ] **Step 4: Expose channel in shared/ipc.ts + preload**

In `src/shared/ipc.ts`:

```ts
import type { FileOwnershipSnapshot } from '../main/ipc/fileOwnershipHandlers';
export type { FileOwnershipSnapshot };

export interface VibeAdeApi {
  /* …existing… */
  fileOwnership: {
    list: () => Promise<FileOwnershipSnapshot>;
  };
}
```

In `src/preload/index.ts`:

```ts
fileOwnership: {
  list: () => ipcRenderer.invoke('fileOwnership:list')
}
```

In `src/preload/global.d.ts`, ensure the type surface matches.

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run tests/main/fileOwnershipHandler.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/fileOwnershipHandlers.ts src/main/ipc/registerIpcHandlers.ts src/preload/index.ts src/preload/global.d.ts tests/main/fileOwnershipHandler.test.ts
git commit -m "feat(redesign): add fileOwnership:list IPC for mindmap consumption"
```

---

## Task 23: Mindmap derived selector (TDD)

**Files:**
- Create: `src/renderer/src/state/slices/mindmapSlice.ts`
- Test: `tests/renderer/mindmapSlice.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/renderer/mindmapSlice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveMindmap } from '../../src/renderer/src/state/slices/mindmapSlice';

describe('deriveMindmap', () => {
  it('produces task, agent, file nodes and the three edge kinds', () => {
    const tasks = [
      { id: 't1', title: 'Build login', assignedAgentIds: ['a1'] },
      { id: 't2', title: 'Style cards',  assignedAgentIds: ['a1','a2'] }
    ];
    const agents = [
      { id: 'a1', name: 'Coder' },
      { id: 'a2', name: 'Designer' }
    ];
    const ownership = {
      byFile: { 'login.tsx': 'a1', 'cards.css': 'a2' },
      byTask: { t1: ['login.tsx'], t2: ['login.tsx','cards.css'] }
    };

    const { nodes, edges } = deriveMindmap(tasks as any, agents as any, ownership);

    expect(nodes.map(n => n.id).sort()).toEqual(
      ['agent:a1','agent:a2','file:cards.css','file:login.tsx','task:t1','task:t2'].sort()
    );

    const edgeIds = edges.map(e => `${e.source}->${e.target}`).sort();
    expect(edgeIds).toContain('task:t1->agent:a1');
    expect(edgeIds).toContain('task:t2->agent:a2');
    expect(edgeIds).toContain('agent:a1->file:login.tsx');
    expect(edgeIds).toContain('agent:a2->file:cards.css');
    expect(edgeIds).toContain('task:t1->file:login.tsx');
    expect(edgeIds).toContain('task:t2->file:cards.css');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/renderer/mindmapSlice.test.ts`
Expected: FAIL (`deriveMindmap` not exported).

- [ ] **Step 3: Implement deriveMindmap**

Create `src/renderer/src/state/slices/mindmapSlice.ts`:

```ts
import type { FileOwnershipSnapshot } from '@shared/ipc';

export interface MindmapNode {
  id: string;
  type: 'task' | 'agent' | 'file';
  label: string;
}
export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  kind: 'task-agent' | 'agent-file' | 'task-file';
}

interface TaskLike { id: string; title: string; assignedAgentIds?: string[] }
interface AgentLike { id: string; name: string }

export function deriveMindmap(
  tasks: TaskLike[],
  agents: AgentLike[],
  ownership: FileOwnershipSnapshot
): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];

  for (const t of tasks) nodes.push({ id: `task:${t.id}`,  type: 'task',  label: t.title });
  for (const a of agents) nodes.push({ id: `agent:${a.id}`, type: 'agent', label: a.name });
  for (const f of Object.keys(ownership.byFile)) nodes.push({ id: `file:${f}`, type: 'file', label: f });

  for (const t of tasks) {
    for (const aid of t.assignedAgentIds ?? []) {
      edges.push({ id: `task:${t.id}->agent:${aid}`, source: `task:${t.id}`, target: `agent:${aid}`, kind: 'task-agent' });
    }
  }
  for (const [filePath, agentId] of Object.entries(ownership.byFile)) {
    edges.push({ id: `agent:${agentId}->file:${filePath}`, source: `agent:${agentId}`, target: `file:${filePath}`, kind: 'agent-file' });
  }
  for (const [taskId, files] of Object.entries(ownership.byTask)) {
    for (const f of files) {
      edges.push({ id: `task:${taskId}->file:${f}`, source: `task:${taskId}`, target: `file:${f}`, kind: 'task-file' });
    }
  }
  return { nodes, edges };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/renderer/mindmapSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/state/slices/mindmapSlice.ts tests/renderer/mindmapSlice.test.ts
git commit -m "feat(redesign): derive task↔agent↔file mindmap from existing state"
```

---

## Task 24: MindmapView component + nav entry

**Files:**
- Create: `src/renderer/src/components/MindmapView.tsx`
- Create: `src/renderer/src/components/MindmapNode.tsx`
- Modify: `src/renderer/src/components/WorkspaceSidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: MindmapNode renderer**

```tsx
import { Handle, Position, NodeProps } from '@xyflow/react';

export function MindmapTaskNode({ data }: NodeProps) {
  return (
    <div className="bg-bg-elev border border-line-brand rounded-md px-3 py-2 text-sm font-display text-fg shadow-qs-md">
      {data.label as string}
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
export function MindmapAgentNode({ data }: NodeProps) {
  return (
    <div className="bg-bg-elev border border-line rounded-pill px-3 py-1.5 text-xs text-fg-accent font-medium shadow-qs-sm">
      {data.label as string}
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
export function MindmapFileNode({ data }: NodeProps) {
  return (
    <div className="bg-bg-sunken border border-line rounded-xs px-2 py-1 text-xs font-mono text-fg-muted">
      {data.label as string}
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
```

- [ ] **Step 2: MindmapView**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useSwarmStore } from '../state/swarmStore';   // existing
import { deriveMindmap } from '../state/slices/mindmapSlice';
import type { FileOwnershipSnapshot } from '@shared/ipc';
import { MindmapTaskNode, MindmapAgentNode, MindmapFileNode } from './MindmapNode';

const NODE_TYPES = {
  task: MindmapTaskNode,
  agent: MindmapAgentNode,
  file: MindmapFileNode
};

function layoutLayered(nodes: ReturnType<typeof deriveMindmap>['nodes']) {
  // Simple 3-column layout: tasks left, agents middle, files right.
  const byType = { task: [] as typeof nodes, agent: [] as typeof nodes, file: [] as typeof nodes };
  for (const n of nodes) byType[n.type].push(n);
  const X = { task: 80, agent: 420, file: 760 };
  const Y_STEP = 80;
  return nodes.map((n) => {
    const col = byType[n.type];
    const i = col.findIndex((x) => x.id === n.id);
    return { id: n.id, type: n.type, position: { x: X[n.type], y: 60 + i * Y_STEP }, data: { label: n.label } };
  });
}

export function MindmapView() {
  const ws = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId));
  const agents = useSwarmStore((s) => s.agents);
  const [ownership, setOwnership] = useState<FileOwnershipSnapshot>({ byFile: {}, byTask: {} });

  useEffect(() => {
    window.vibeAde.fileOwnership.list().then(setOwnership);
  }, [ws?.id]);

  const { nodes, edges } = useMemo(
    () => deriveMindmap(ws?.tasks ?? [], agents ?? [], ownership),
    [ws?.tasks, agents, ownership]
  );
  const rfNodes = useMemo(() => layoutLayered(nodes), [nodes]);
  const rfEdges = useMemo(
    () => edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      style: { stroke: 'var(--qs-stone-500)' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--qs-stone-500)' }
    })),
    [edges]
  );

  return (
    <div className="w-full h-full bg-bg">
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} fitView>
        <Background color="var(--qs-ink-700)" gap={32} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar Memory entry + App route**

In `WorkspaceSidebar.tsx`, add a "Memory" entry below existing nav: Lucide `Brain` icon, navigates to a new `activeView` value `'mindmap'`.

In `App.tsx`, branch the main content area to render `<MindmapView />` when `activeView === 'mindmap'`.

- [ ] **Step 4: Typecheck + verify**

Run: `npm run typecheck` (PASS), `npm run dev`. Open a workspace that has tasks + agents + assigned files. Click "Memory" in the rail. Confirm: task/agent/file nodes render in three columns; edges connect correctly; pan/zoom work; clicking back to terminals leaves the workspace state intact.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/MindmapView.tsx src/renderer/src/components/MindmapNode.tsx src/renderer/src/components/WorkspaceSidebar.tsx src/renderer/src/App.tsx
git commit -m "feat(redesign): Memory mindmap view with 3-column layered layout"
```

---

## Task 25: Smoke-test checklist additions

**Files:**
- Modify: `docs/SMOKE_TEST_CHECKLIST.md`

- [ ] **Step 1: Append new section**

Append to `docs/SMOKE_TEST_CHECKLIST.md`:

```markdown
## v0.5.0 — UI Redesign

### Visual
- [ ] App launches with ink-900 background, cream text, Sora display + Manrope body.
- [ ] All hex literals replaced with QuanSynd tokens (no random `#FFFFFF` text/borders).

### Workspace modes
- [ ] Start hero shows three cards: Space, Swarm, Canvas.
- [ ] Creating a workspace from each card persists the correct `mode`.
- [ ] Existing pre-v0.5 workspaces load with `mode: 'space'` (migration).

### Card-grid layout
- [ ] Layout selector offers 2×1, 2×2, 3×2, 4×2 presets.
- [ ] Applying a preset spawns the right number of terminals.
- [ ] Grid persists across workspace reopen.

### Canvas mode
- [ ] Canvas-mode workspace shows pan/zoom plane.
- [ ] Terminals can be dragged and resized.
- [ ] Alt-drag pans; Ctrl-wheel zooms (range 0.25–2.0).
- [ ] Transform + card positions persist across reload.

### Mindmap
- [ ] "Memory" entry in left rail.
- [ ] Task ↔ Agent ↔ File nodes render with correct edges.
- [ ] Updates when tasks reassigned or files claimed.

### Regression
- [ ] Sign in / sign out works.
- [ ] Cloud sync round-trips.
- [ ] Swarm session creates and streams transcripts.
- [ ] Browser pane loads URLs.
- [ ] Settings tabs all functional.
```

- [ ] **Step 2: Commit**

```bash
git add docs/SMOKE_TEST_CHECKLIST.md
git commit -m "docs(redesign): extend smoke checklist for v0.5.0 features"
```

---

## Task 26: Full test suite + typecheck gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Lint (typecheck-aliased gate)**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Unit tests**

Run: `npm run test`
Expected: PASS, zero unhandled rejections. Specifically all new tests added in Tasks 16, 19, 22, 23 pass alongside the existing suite.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

If any of the above fail, stop and fix the underlying issue before proceeding to Task 27. Do not skip tests.

---

## Task 27: Manual smoke pass

**Files:** none

- [ ] **Step 1: Launch dev build**

Run: `npm run dev`. Walk through every checkbox under "v0.5.0 — UI Redesign" in `docs/SMOKE_TEST_CHECKLIST.md` plus the pre-existing checklist sections (auth, session, cloud sync, billing). Mark each item as you go in a copy of the checklist; do not ship if any item fails.

- [ ] **Step 2: Address regressions**

For any failed item, fix in a focused commit referencing the checklist item by name, then re-run the affected step.

- [ ] **Step 3: Commit any regression fixes**

If regression fixes were made, commit them with `fix(redesign): …` messages. If everything passed clean, no commit here.

---

## Task 28: Version bump to 0.5.0

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml` (if it pins `version` separately — usually it doesn't)

- [ ] **Step 1: Bump version**

Edit `package.json`: change `"version": "0.4.1"` (or whatever current) to `"version": "0.5.0"`.

- [ ] **Step 2: Update lockfile**

Run: `npm install`
Expected: only the `version` field in `package-lock.json` updates.

- [ ] **Step 3: Typecheck (sanity)**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(release): bump version to 0.5.0"
```

---

## Task 29: Package Windows installers

**Files:** none (build artifacts only)

- [ ] **Step 1: Build distributables**

Run: `npm run dist:win`
Expected: PASS. Artifacts written to `release/`:
- `release/Vibe-ADE-0.5.0-setup-x64.exe`
- `release/Vibe-ADE-0.5.0-portable-x64.exe`

- [ ] **Step 2: Launch both installers**

Install the NSIS build (`*setup*.exe`) on the dev machine; launch; confirm app opens, signs in, shows new UI. Then launch the portable `.exe` directly — confirm same.

- [ ] **Step 3: Record SHA256s**

Run (PowerShell):
```powershell
Get-FileHash release\Vibe-ADE-0.5.0-setup-x64.exe -Algorithm SHA256
Get-FileHash release\Vibe-ADE-0.5.0-portable-x64.exe -Algorithm SHA256
```
Save the two hashes for the release notes (next task).

---

## Task 30: Release notes + git tag

**Files:**
- Create: `docs/V0_5_0_RELEASE_NOTES_2026-05-14.md`

- [ ] **Step 1: Write release notes**

Create `docs/V0_5_0_RELEASE_NOTES_2026-05-14.md`:

```markdown
# Vibe-ADE v0.5.0 — UI Redesign

Date: 2026-05-14

## Highlights
- New QuanSynd brand identity across every renderer surface (dark ink + warm bronze/gold, Sora + Manrope + JetBrains Mono).
- Three workspace modes on Start: Space, Swarm, Canvas.
- Card-grid terminal layout presets (2×1, 2×2, 3×2, 4×2).
- Canvas mode — free-form pan/zoom plane for terminals.
- Tasks ↔ Agents ↔ Files mindmap view in the workspace shell.

## Backwards compatibility
- Workspaces saved by v0.4.x load unchanged. They default to `mode: 'space'` on first read.
- One new IPC channel: `fileOwnership:list` (read-only).
- No persisted-state format breaks.

## Verification
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS
- `npm run build`: PASS
- `npm run dist:win`: PASS
- Manual smoke (`docs/SMOKE_TEST_CHECKLIST.md`): PASS

## Artifacts
- `release/Vibe-ADE-0.5.0-setup-x64.exe`
  - SHA256: <fill from Task 29 step 3>
- `release/Vibe-ADE-0.5.0-portable-x64.exe`
  - SHA256: <fill from Task 29 step 3>

## Known gaps
- Light theme tokens are defined but not validated. The Settings "Light" card switches theme but visuals may have minor gaps.
- Workspace mode is fixed at creation. Mode-switching for existing workspaces is a follow-up.
- Mindmap layout is layered (3 columns). A force-directed mode is a follow-up.
```

Replace `<fill from Task 29 step 3>` with the actual hashes.

- [ ] **Step 2: Commit release notes**

```bash
git add docs/V0_5_0_RELEASE_NOTES_2026-05-14.md
git commit -m "docs(release): v0.5.0 release notes"
```

- [ ] **Step 3: Tag**

```bash
git tag -a v0.5.0 -m "Vibe-ADE v0.5.0 — UI redesign"
```

- [ ] **Step 4: Push branch + tag**

**Confirm with the user before pushing — single-cutover release.** Then:

```bash
git push origin redesign/v0.5
git push origin v0.5.0
```

- [ ] **Step 5: Open PR `redesign/v0.5` → `main`**

```bash
gh pr create --base main --head redesign/v0.5 --title "v0.5.0 — UI redesign (QuanSynd brand + modes + canvas + mindmap)" --body "$(cat docs/V0_5_0_RELEASE_NOTES_2026-05-14.md)"
```

- [ ] **Step 6: Merge after review**

User approves PR → merge to `main`. Done.

