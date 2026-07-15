# Looks & Delight (Package D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the CNVS visual-polish gap: 8 bundled pixel-art wall scenes, quieter card chrome with a working-glow, a music/focus wall card with EQ, and a click-to-jump minimap.

**Architecture:** Everything rides existing systems. D1 = new `Theme[]` entries + committed PNG assets rendered by a Node script. D2 = CSS keyed off the `data-working` attribute `StatusFooter` already stamps. D4 = a new `Card` kind in `cardStore` mirroring the browser-card open/close/persist pattern. D3 = one SVG overlay projecting `cardStore` rects + the camera ref through a pure, tested module.

**Tech Stack:** React 19 + TypeScript + Vite, zustand, vitest, plain Node (no new deps — the scene renderer encodes PNG with `node:zlib`).

**Spec:** `docs/superpowers/specs/2026-07-15-looks-delight-design.md`

## Global Constraints

- Branch `V1.0.0`, one commit per task. NEVER touch the user's running Vibe Space instance; app verification uses a separate dev instance (`npm run app`) in Task 11 only.
- Gates before every commit: `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` — check `$?` directly, never through a pipe.
- Brand: warm amber `#d79a3d` + warm neutrals; never blue-led. UI language is desktop software (VS Code/iTerm), not SaaS.
- Scene assets ≤ 500KB each, under `public/themes/scenes/`.
- All D features ship to all tiers — no entitlement checks anywhere.
- Do not modify `src-tauri/src/control.rs` (has unrelated uncommitted changes) or any file outside those named in a task.
- After the final task: `graphify update .`.

---

### Task 1: Scene renderer script + 8 bundled scene PNGs (D1 assets)

**Files:**
- Create: `scripts/render-scenes.mjs`
- Create (generated): `public/themes/scenes/*.png` (8 files, committed)

**Interfaces:**
- Produces: `public/themes/scenes/<id>.png` for ids `amber-dunes`, `meadow-night`, `campfire`, `harvest`, `lantern-harbor`, `canyon-dusk`, `ember-city`, `tea-room`. Task 2's `SCENE_THEMES` references these URLs verbatim.

Scenes render at **480×270** (native pixel-art resolution) and are displayed full-bleed with CSS `image-rendering: pixelated` (Task 2) — no upscaling, tiny files, crisp pixels. This supersedes the spec's "upscale to 1920×1080 WebP" detail: same look, smaller assets, zero native deps. PNG is encoded by hand with `node:zlib` (filter-0 scanlines, RGB color type 2).

The scene painters below are the starting composition; **tune palettes/shapes by eye** after the first render — re-run the script and look at the PNGs until each scene reads as a warm, cohesive Quansynd scene. Deterministic seeds keep re-renders stable.

- [ ] **Step 1: Write `scripts/render-scenes.mjs`**

```js
// Renders the bundled pixel-art wall scenes into public/themes/scenes/.
// Pure Node (node:zlib PNG encoder) — run: node scripts/render-scenes.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const W = 480, H = 270;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "themes", "scenes");

// ---------- PNG encoding ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- paint primitives ----------
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

class Px {
  constructor() { this.buf = Buffer.alloc(W * H * 3); }
  set(x, y, c) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
  }
  get(x, y) { const i = (y * W + x) * 3; return [this.buf[i], this.buf[i + 1], this.buf[i + 2]]; }
  add(x, y, c, k) { // additive glow, k 0..1
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const p = this.get(x, y);
    this.set(x, y, p.map((v, i) => Math.min(255, Math.round(v + c[i] * k))));
  }
}
/** Vertical gradient across [y0,y1) through color stops, ordered-dithered. */
function sky(px, stops, y0 = 0, y1 = H) {
  const cols = stops.map(hex);
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const f = t * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(f));
    for (let x = 0; x < W; x++) {
      const d = (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.08; // dither band edges
      px.set(x, y, lerp(cols[i], cols[i + 1], Math.max(0, Math.min(1, f - i + d))));
    }
  }
}
function stars(px, count, yMax, rng, color = "#f3eee5") {
  const c = hex(color);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * yMax);
    px.add(x, y, c, 0.35 + rng() * 0.65);
  }
}
/** Midpoint-displacement ridge silhouette filled to the bottom. */
function ridge(px, baseY, amp, color, rng, rough = 0.55) {
  const c = hex(color);
  let pts = [baseY + (rng() - 0.5) * amp, baseY + (rng() - 0.5) * amp];
  while (pts.length < W + 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (rng() - 0.5) * amp);
      amp *= 1; // per-pass decay applied below
    }
    next.push(pts[pts.length - 1]);
    pts = next; amp *= rough;
  }
  for (let x = 0; x < W; x++) {
    const top = Math.round(pts[Math.floor((x / W) * (pts.length - 1))]);
    for (let y = Math.max(0, top); y < H; y++) px.set(x, y, c);
  }
}
function rect(px, x0, y0, w, h, color) {
  const c = hex(color);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.set(x, y, c);
}
function glow(px, cx, cy, r, color, strength = 1) {
  const c = hex(color);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d <= 1) px.add(x, y, c, strength * (1 - d) * (1 - d));
    }
}

// ---------- scenes ----------
const SCENES = {
  "amber-dunes"(px) {
    const rng = mulberry32(11);
    sky(px, ["#2a1a10", "#7a3f1e", "#d79a3d", "#e8b95f"], 0, 170);
    glow(px, 240, 150, 60, "#ffd98a", 0.9); // setting sun
    ridge(px, 150, 26, "#8a5a26", rng);
    ridge(px, 185, 22, "#5e3a18", rng);
    ridge(px, 220, 18, "#3a2410", rng);
    stars(px, 30, 60, rng, "#e8c98a");
  },
  "meadow-night"(px) {
    const rng = mulberry32(22);
    sky(px, ["#100e14", "#241d22", "#3a2d26"], 0, 200);
    stars(px, 140, 150, rng);
    glow(px, 390, 48, 22, "#f3eee5", 1.1); // moon
    ridge(px, 175, 30, "#221a14", rng); // treeline
    ridge(px, 205, 14, "#181410", rng); // meadow
    for (let i = 0; i < 40; i++) { // fireflies
      glow(px, Math.floor(rng() * W), 190 + Math.floor(rng() * 70), 3, "#e8c060", 0.8);
    }
  },
  campfire(px) {
    const rng = mulberry32(33);
    sky(px, ["#0d0b0f", "#1c1512", "#2a1d12"], 0, 190);
    stars(px, 90, 130, rng);
    ridge(px, 140, 40, "#171310", rng); // far forest
    ridge(px, 195, 24, "#100d0a", rng); // near forest
    ridge(px, 235, 8, "#0b0908", rng); // ground
    glow(px, 240, 238, 42, "#e07830", 1.2); // fire glow
    glow(px, 240, 232, 14, "#ffcf6e", 1.4); // flame core
    rect(px, 226, 244, 28, 4, "#241811"); // logs
  },
  harvest(px) {
    const rng = mulberry32(44);
    sky(px, ["#c97f2f", "#e6ae55", "#f0cd85"], 0, 165);
    glow(px, 120, 120, 46, "#ffe6a8", 1.0); // low sun
    ridge(px, 158, 12, "#a5772e", rng); // far field
    ridge(px, 190, 10, "#8a5f22", rng);
    ridge(px, 225, 8, "#6b4718", rng);
    rect(px, 330, 150, 44, 34, "#3a2412"); // farmhouse
    rect(px, 322, 142, 60, 8, "#2a1a0e"); // roof
    glow(px, 352, 168, 7, "#ffd98a", 1.2); // lit window
  },
  "lantern-harbor"(px) {
    const rng = mulberry32(55);
    sky(px, ["#131019", "#2a2026", "#4a3226"], 0, 175);
    stars(px, 80, 110, rng);
    ridge(px, 150, 20, "#1a1418", rng); // far shore
    for (let y = 175; y < H; y++) // water: darkened sky mirror + shimmer
      for (let x = 0; x < W; x++) {
        const s = px.get(x, 350 - y < 0 ? 0 : 350 - y);
        px.set(x, y, s.map((v) => Math.round(v * 0.4)));
      }
    rect(px, 60, 195, 150, 5, "#241a12"); // dock
    for (const lx of [80, 130, 180]) {
      rect(px, lx, 172, 2, 23, "#17110c"); // lantern posts
      glow(px, lx + 1, 170, 9, "#ffbe5c", 1.3);
      glow(px, lx + 1, 215, 6, "#c98a3a", 0.6); // reflection
    }
  },
  "canyon-dusk"(px) {
    const rng = mulberry32(66);
    sky(px, ["#1d1220", "#5c2a22", "#c06a30", "#e8a050"], 0, 175);
    stars(px, 50, 80, rng, "#e8c98a");
    ridge(px, 130, 34, "#6e3a24", rng); // far mesa
    ridge(px, 170, 40, "#4a2618", rng);
    ridge(px, 215, 30, "#2c1710", rng);
  },
  "ember-city"(px) {
    const rng = mulberry32(77);
    sky(px, ["#151016", "#33201c", "#5c3520"], 0, 200);
    stars(px, 60, 90, rng);
    for (let x = 0; x < W; ) { // skyline: random towers with lit windows
      const w = 14 + Math.floor(rng() * 26), top = 110 + Math.floor(rng() * 80);
      rect(px, x, top, w, H - top, rng() < 0.5 ? "#1c1410" : "#241a12");
      for (let wy = top + 6; wy < 250; wy += 8)
        for (let wx = x + 3; wx < x + w - 3; wx += 6)
          if (rng() < 0.28) px.set(wx, wy, hex("#e8b45c")), px.set(wx + 1, wy, hex("#e8b45c"));
      x += w + 2 + Math.floor(rng() * 6);
    }
    glow(px, 240, 268, 120, "#c9741f", 0.25); // city glow from below
  },
  "tea-room"(px) {
    const rng = mulberry32(88);
    sky(px, ["#2c211a", "#3a2c20", "#463526"], 0, H); // warm wall
    rect(px, 300, 50, 120, 110, "#171320"); // window: night
    const win = new Px(); sky(win, ["#131019", "#241d2a"], 0, H);
    for (let y = 50; y < 160; y++) for (let x = 300; x < 420; x++) px.set(x, y, win.get(x, y));
    for (let i = 0; i < 25; i++) px.add(305 + Math.floor(rng() * 110), 52 + Math.floor(rng() * 60), hex("#f3eee5"), 0.6);
    rect(px, 296, 46, 128, 4, "#1c1006"); rect(px, 296, 160, 128, 5, "#1c1006"); // frame
    rect(px, 358, 50, 3, 110, "#1c1006"); // mullion
    rect(px, 0, 200, W, 70, "#241708"); // table
    rect(px, 100, 178, 34, 22, "#7a4a20"); // teapot
    rect(px, 108, 170, 18, 8, "#7a4a20");
    for (let i = 0; i < 12; i++) glow(px, 115 + Math.floor(rng() * 6), 158 - i * 4, 3, "#d8cdbd", 0.25); // steam
    glow(px, 60, 190, 26, "#e8a050", 1.1); // candle pool
    glow(px, 60, 182, 6, "#ffd98a", 1.4);
  },
};

mkdirSync(OUT, { recursive: true });
for (const [id, paint] of Object.entries(SCENES)) {
  const px = new Px();
  paint(px);
  const file = join(OUT, `${id}.png`);
  writeFileSync(file, encodePng(px.buf));
  console.log(`${id}.png  ${(statSync(file).size / 1024).toFixed(1)}KB`);
}
```

- [ ] **Step 2: Run the renderer**

Run: `node scripts/render-scenes.mjs`
Expected: 8 lines like `amber-dunes.png  38.2KB`, every size well under 500KB.

- [ ] **Step 3: Eyeball every scene and tune**

Open each `public/themes/scenes/*.png` (Read tool renders images). For any scene that reads muddy, empty, or off-brand (cool/blue-led), adjust its palette stops, ridge heights, or glow positions in `SCENES` and re-run until all 8 look like intentional warm pixel-art scenes. This step is done when you'd put each one on a demo screen.

- [ ] **Step 4: Commit**

```bash
git add scripts/render-scenes.mjs public/themes/scenes
git commit -m "feat(themes): pixel-art scene renderer + 8 bundled scene assets"
```

### Task 2: SCENE_THEMES + picker section + pixelated rendering (D1 wiring)

**Files:**
- Modify: `src/settings/themes.ts` (after `APPEARANCE_THEMES`, before `VIDEO_THEMES`)
- Modify: `src/settings/themes.test.ts`
- Modify: `src/settings/SettingsModal.tsx:329-375` (ThemeCard preview + ThemesPane groups)
- Modify: `src/wall/WallBackground.tsx`
- Modify: `src/App.css` (theme-preview image + pixelated wall-bg)

**Interfaces:**
- Consumes: Task 1's `public/themes/scenes/<id>.png`.
- Produces: `SCENE_THEMES: Theme[]` exported from `src/settings/themes.ts`; `THEMES` ordering `[...APPEARANCE_THEMES, ...SCENE_THEMES, ...VIDEO_THEMES]`. The `apply_theme` voice command and `accentForBackground` pick these up with no changes.

- [ ] **Step 1: Write the failing tests** — append to `src/settings/themes.test.ts`:

```ts
import { SCENE_THEMES, accentForBackground, DEFAULT_ACCENT } from "./themes";

describe("SCENE_THEMES", () => {
  it("has 8 scenes with unique ids and bundled urls", () => {
    expect(SCENE_THEMES).toHaveLength(8);
    expect(new Set(SCENE_THEMES.map((t) => t.id)).size).toBe(8);
    for (const t of SCENE_THEMES) {
      expect(t.background.kind).toBe("image");
      expect("url" in t.background && t.background.url).toMatch(/^\/themes\/scenes\/[a-z-]+\.png$/);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("drives the accent through accentForBackground", () => {
    const meadow = SCENE_THEMES.find((t) => t.id === "meadow-night")!;
    expect(accentForBackground(meadow.background)).toBe(meadow.accent);
    expect(accentForBackground(meadow.background)).not.toBe(DEFAULT_ACCENT);
  });
});
```

(Merge the new imports into the file's existing `./themes` import line.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/settings/themes.test.ts`
Expected: FAIL — `SCENE_THEMES` is not exported.

- [ ] **Step 3: Add `SCENE_THEMES` to `src/settings/themes.ts`** (between `APPEARANCE_THEMES` and `VIDEO_THEMES`), and update the `THEMES` line:

```ts
/** Bundled pixel-art scenes, rendered by scripts/render-scenes.mjs. Each accent
    is sampled from its own artwork so the whole UI recolors with the scene. */
export const SCENE_THEMES: Theme[] = [
  { id: "amber-dunes", name: "Amber Dunes", tagline: "desert dusk", background: { kind: "image", url: "/themes/scenes/amber-dunes.png" }, accent: "#e8b95f" },
  { id: "meadow-night", name: "Meadow Night", tagline: "fireflies at dark", background: { kind: "image", url: "/themes/scenes/meadow-night.png" }, accent: "#e8c060" },
  { id: "campfire", name: "Campfire", tagline: "forest firelight", background: { kind: "image", url: "/themes/scenes/campfire.png" }, accent: "#e07830" },
  { id: "harvest", name: "Harvest", tagline: "golden field", background: { kind: "image", url: "/themes/scenes/harvest.png" }, accent: "#d79a3d" },
  { id: "lantern-harbor", name: "Lantern Harbor", tagline: "docks at night", background: { kind: "image", url: "/themes/scenes/lantern-harbor.png" }, accent: "#ffbe5c" },
  { id: "canyon-dusk", name: "Canyon Dusk", tagline: "mesa first stars", background: { kind: "image", url: "/themes/scenes/canyon-dusk.png" }, accent: "#e8a050" },
  { id: "ember-city", name: "Ember City", tagline: "warm-lit skyline", background: { kind: "image", url: "/themes/scenes/ember-city.png" }, accent: "#e8b45c" },
  { id: "tea-room", name: "Tea Room", tagline: "cozy window light", background: { kind: "image", url: "/themes/scenes/tea-room.png" }, accent: "#d8a55f" },
];

export const THEMES: Theme[] = [...APPEARANCE_THEMES, ...SCENE_THEMES, ...VIDEO_THEMES];
```

If Task 1's tuning changed a scene's dominant tones, adjust that entry's `accent` to match the artwork (stay warm).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/settings/themes.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: ThemeCard image preview** — in `src/settings/SettingsModal.tsx`, inside the `theme-preview` span (next to the existing video branch):

```tsx
{theme.background.kind === "image" && "url" in theme.background && (
  <img className="theme-preview-img" src={theme.background.url} alt="" />
)}
```

- [ ] **Step 6: Scenes group in ThemesPane** — insert between the appearance `theme-grid` div and the "Video themes" group:

```tsx
<div className="set-group">
  <span className="set-label">Scenes</span>
  <div className="theme-grid">
    {SCENE_THEMES.map((t) => (
      <ThemeCard
        key={t.id}
        theme={t}
        active={isThemeActive(background, t)}
        onSelect={() => onChangeBackground(t.background)}
      />
    ))}
  </div>
</div>
```

Add `SCENE_THEMES` to the existing `./themes` import in `SettingsModal.tsx`.

- [ ] **Step 7: Pixelated rendering for scene backgrounds** — `src/wall/WallBackground.tsx`, image branch only (user-supplied photos must NOT be pixelated):

```tsx
if (background.kind === "image") {
  const pixel = background.url?.startsWith("/themes/scenes/");
  return (
    <div
      className="wall-bg"
      style={{
        backgroundImage: `url(${srcOf(background)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        imageRendering: pixel ? "pixelated" : undefined,
      }}
    />
  );
}
```

And in `src/App.css` next to `.theme-preview-video`:

```css
.theme-preview-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  image-rendering: pixelated;
}
```

- [ ] **Step 8: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both must pass (`$?` = 0, checked separately, no piping).

```bash
git add src/settings/themes.ts src/settings/themes.test.ts src/settings/SettingsModal.tsx src/wall/WallBackground.tsx src/App.css
git commit -m "feat(themes): bundled Scenes theme group with per-scene accents"
```

### Task 3: Chrome quieting + working glow (D2)

**Files:**
- Modify: `src/wall/transform.ts:6` (`HEADER_H`)
- Modify: `src/App.css` (`.terminal-window` block, header/title/buttons)

**Interfaces:**
- Consumes: `data-working` attribute already stamped by `StatusFooter` (`src/wall/StatusFooter.tsx:23`); `--accent` custom property.
- Produces: nothing consumed by later tasks (Task 7's MusicWindow reuses the same `.terminal-window` chrome classes and inherits this styling for free).

No new unit tests: this is presentation CSS plus one constant that existing tests already reference relatively (`gridLayout.test.ts:282` asserts against `HEADER_H`, so it keeps passing). Visual verification happens in Task 11.

- [ ] **Step 1: Shrink the titlebar** — `src/wall/transform.ts`:

```ts
/** Height (world px) reserved at the top of a terminal window for its header. */
export const HEADER_H = 24;
```

All three card components (`TerminalWindow`, `BrowserWindow`, `FileViewerWindow`) set the header height inline from this constant — no other height edits needed.

- [ ] **Step 2: Quiet the chrome + add the working glow** — in `src/App.css`:

Replace the `border` line in `.terminal-window` (line 98) with a lower-contrast hairline:

```css
border: 1px solid color-mix(in srgb, var(--rule) 65%, transparent); border-radius: var(--radius); overflow: hidden;
```

Shrink/mute the title (`.terminal-title`, line 157): change the font line to

```css
font: 500 10.5px var(--font-mono); color: var(--text-faint);
```

Keep `flex: 1` and the ellipsis rules as they are. (`.terminal-window:focus-within .terminal-title { color: var(--text-muted); }` — add this rule so the focused card's title reads slightly stronger.)

Ghost the header buttons until the card is hovered or focused — add after the `.terminal-close:hover` rule (line 176):

```css
/* Quiet chrome: window buttons appear only when the card is engaged. */
.terminal-maximize, .terminal-close { opacity: 0; transition: color .14s, background .14s, opacity .14s; }
.terminal-window:hover .terminal-maximize, .terminal-window:hover .terminal-close,
.terminal-window:focus-within .terminal-maximize, .terminal-window:focus-within .terminal-close,
.terminal-maximize:focus-visible, .terminal-close:focus-visible { opacity: 1; }
```

Add the working glow after the `status-pulse` keyframes (line 145):

```css
/* Working agents glow: accent border + soft halo, slow breathe. Focus ring
   (:focus-within) still wins visually — it stacks var(--focus) on top. */
.terminal-window[data-working="true"] {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  animation: working-glow 3s ease-in-out infinite;
}
@keyframes working-glow {
  0%, 100% { box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 22%, transparent), var(--shadow); }
  50% { box-shadow: 0 0 26px color-mix(in srgb, var(--accent) 38%, transparent), var(--shadow); }
}
.terminal-window[data-working="true"]:focus-within {
  animation: none;
  box-shadow: var(--focus), 0 0 18px color-mix(in srgb, var(--accent) 28%, transparent), var(--shadow);
}
```

- [ ] **Step 3: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add src/wall/transform.ts src/App.css
git commit -m "feat(wall): quieter card chrome + working-agent glow"
```

### Task 4: Curated stations module (D4)

**Files:**
- Create: `src/wall/stations.ts`
- Create: `src/wall/stations.test.ts`

**Interfaces:**
- Produces: `type Station = { id: string; name: string; mood: string; url: string; attribution: string }`, `STATIONS: Station[]`, `nextStation(currentId: string): Station`, `findStation(phrase: string): Station | undefined`. Tasks 6–8 consume all four.

**Stream verification (do this FIRST, it decides the list):** for each candidate below, (a) `curl -sI --max-time 10 <url>` — expect HTTP 200 (or ICY 200) with an `audio/*` or `application/octet-stream` content type; (b) check the broadcaster's site/terms confirm third-party players are permitted. Ship only stations passing both; the design floor is 3. Candidates:

| station | mood | url | why it likely qualifies |
|---|---|---|---|
| Radio Paradise (Main) | eclectic | `https://stream.radioparadise.com/aac-128` | RP publishes open streams + API and explicitly welcomes third-party players |
| Radio Paradise (Mellow) | mellow focus | `https://stream.radioparadise.com/mellow-128` | same |
| laut.fm lofi | lofi beats | `https://stream.laut.fm/lofi` | laut.fm publishes public stream URLs + a free API for all stations |
| laut.fm eilon (or another laut.fm ambient channel found via `https://api.laut.fm/letter/a/stations`) | ambient | `https://stream.laut.fm/<name>` | same |
| Nightride FM | synthwave | `https://stream.nightride.fm/nightride.m4a` | community radio; confirm their FAQ/terms allow external players before shipping |

If a candidate fails, substitute another laut.fm channel (their whole directory is fair game) so the shipped list has 3–5 entries covering lofi/ambient/focus moods.

- [ ] **Step 1: Write the failing tests** — `src/wall/stations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { STATIONS, nextStation, findStation } from "./stations";

describe("STATIONS", () => {
  it("ships 3-5 verified https stations with attribution", () => {
    expect(STATIONS.length).toBeGreaterThanOrEqual(3);
    expect(STATIONS.length).toBeLessThanOrEqual(5);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const s of STATIONS) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.mood.length).toBeGreaterThan(0);
      expect(s.attribution.length).toBeGreaterThan(0);
    }
  });
});

describe("nextStation", () => {
  it("cycles through the list and wraps", () => {
    expect(nextStation(STATIONS[0].id).id).toBe(STATIONS[1].id);
    expect(nextStation(STATIONS[STATIONS.length - 1].id).id).toBe(STATIONS[0].id);
  });
  it("falls back to the first station for unknown ids (e.g. custom)", () => {
    expect(nextStation("custom").id).toBe(STATIONS[0].id);
  });
});

describe("findStation", () => {
  it("matches by name or mood, case-insensitively", () => {
    const s = STATIONS[0];
    expect(findStation(s.name.toLowerCase())?.id).toBe(s.id);
    expect(findStation(s.mood.toUpperCase())?.id).toBe(s.id);
    expect(findStation("no such station")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/stations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/wall/stations.ts`** (URLs = the verified survivors; the entries shown assume all candidates passed — edit to match reality):

```ts
/** A curated internet-radio station the music card can play. Every entry's
    broadcaster permits third-party players (verified 2026-07; see plan Task 4). */
export type Station = {
  id: string;
  name: string;
  mood: string;
  url: string;
  /** Shown in the card UI — the deal for using the stream. */
  attribution: string;
};

export const STATIONS: Station[] = [
  { id: "rp-main", name: "Radio Paradise", mood: "eclectic", url: "https://stream.radioparadise.com/aac-128", attribution: "radioparadise.com — listener-supported" },
  { id: "rp-mellow", name: "RP Mellow", mood: "mellow focus", url: "https://stream.radioparadise.com/mellow-128", attribution: "radioparadise.com — listener-supported" },
  { id: "laut-lofi", name: "laut.fm lofi", mood: "lofi beats", url: "https://stream.laut.fm/lofi", attribution: "lofi @ laut.fm" },
  { id: "nightride", name: "Nightride FM", mood: "synthwave", url: "https://stream.nightride.fm/nightride.m4a", attribution: "nightride.fm" },
];

/** The station after `currentId`, wrapping; unknown ids (custom URLs) restart the dial. */
export function nextStation(currentId: string): Station {
  const i = STATIONS.findIndex((s) => s.id === currentId);
  return STATIONS[(i + 1) % STATIONS.length];
}

/** Fuzzy match by name or mood — feeds the change_station voice command. */
export function findStation(phrase: string): Station | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return undefined;
  return STATIONS.find(
    (s) => s.name.toLowerCase().includes(p) || p.includes(s.name.toLowerCase()) || s.mood.toLowerCase().includes(p)
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/stations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/stations.ts src/wall/stations.test.ts
git commit -m "feat(music): curated station list with verified free streams"
```

### Task 5: EQ helper module (D4)

**Files:**
- Create: `src/wall/eq.ts`
- Create: `src/wall/eq.test.ts`

**Interfaces:**
- Produces: `BAR_COUNT = 16`, `barsFromBins(bins: Uint8Array, count?: number): number[]` (0..1 per bar), `isSilent(bins: Uint8Array): boolean`, `simulateBars(prev: number[], tMs: number): number[]`. Task 7's MusicWindow consumes all four; the canvas drawing itself stays in the component.

Context for the implementer: `AnalyserNode.getByteFrequencyData` fills a `Uint8Array` (0–255 per frequency bin). Cross-origin streams without CORS headers make it permanently all-zero even while audio plays — that is what `isSilent` + the component's 2s timer detect, flipping to `simulateBars` (a deterministic smooth fake driven only by time).

- [ ] **Step 1: Write the failing tests** — `src/wall/eq.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BAR_COUNT, barsFromBins, isSilent, simulateBars } from "./eq";

describe("barsFromBins", () => {
  it("groups bins into BAR_COUNT bars normalized to 0..1", () => {
    const bins = new Uint8Array(1024).fill(255);
    const bars = barsFromBins(bins);
    expect(bars).toHaveLength(BAR_COUNT);
    for (const b of bars) expect(b).toBeCloseTo(1, 5);
  });
  it("returns zeros for silence", () => {
    expect(barsFromBins(new Uint8Array(1024))).toEqual(new Array(BAR_COUNT).fill(0));
  });
  it("keeps every bar within 0..1 for arbitrary data", () => {
    const bins = new Uint8Array(512).map((_, i) => (i * 37) % 256);
    for (const b of barsFromBins(bins)) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});

describe("isSilent", () => {
  it("is true only when every bin is zero", () => {
    expect(isSilent(new Uint8Array(64))).toBe(true);
    const one = new Uint8Array(64); one[13] = 1;
    expect(isSilent(one)).toBe(false);
  });
});

describe("simulateBars", () => {
  it("is deterministic in t and stays within 0.05..1", () => {
    const prev = new Array(BAR_COUNT).fill(0.5);
    const a = simulateBars(prev, 1234);
    expect(simulateBars(prev, 1234)).toEqual(a);
    for (const b of a) {
      expect(b).toBeGreaterThanOrEqual(0.05);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
  it("moves smoothly: one step never jumps a bar more than 0.35", () => {
    const prev = new Array(BAR_COUNT).fill(0.5);
    const next = simulateBars(prev, 999);
    next.forEach((b, i) => expect(Math.abs(b - prev[i])).toBeLessThanOrEqual(0.35));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/eq.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/wall/eq.ts`**:

```ts
/** EQ bar math for the music card. The component owns the AnalyserNode and
    canvas; this module is pure so the fallback behavior is testable. */
export const BAR_COUNT = 16;

/** Averages analyser bins (0-255) into `count` bars normalized to 0..1. */
export function barsFromBins(bins: Uint8Array, count = BAR_COUNT): number[] {
  const per = Math.max(1, Math.floor(bins.length / count));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = i * per; j < (i + 1) * per && j < bins.length; j++) sum += bins[j];
    bars.push(sum / (per * 255));
  }
  return bars;
}

/** True when the analyser yields nothing — either real silence or a CORS-opaque
    stream (which stays all-zero forever; the component times this out). */
export function isSilent(bins: Uint8Array): boolean {
  return bins.every((b) => b === 0);
}

/** Fake-but-lively bars for CORS-opaque streams: layered sines per bar, eased
    toward from `prev` so motion stays smooth. Deterministic in (prev, tMs). */
export function simulateBars(prev: number[], tMs: number): number[] {
  return prev.map((p, i) => {
    const target =
      0.4 +
      0.28 * Math.sin(tMs / 700 + i * 1.7) +
      0.22 * Math.sin(tMs / 240 + i * 0.9 + 2);
    const clamped = Math.min(1, Math.max(0.05, target));
    return p + (clamped - p) * 0.3;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/eq.test.ts`
Expected: PASS. (If the smoothness assertion trips, lower the `0.3` easing factor — never raise the test bound.)

- [ ] **Step 5: Commit**

```bash
git add src/wall/eq.ts src/wall/eq.test.ts
git commit -m "feat(music): EQ bar math with simulated fallback"
```

### Task 6: MusicCard store kind + actions + per-wall persistence (D4)

**Files:**
- Modify: `src/wall/cardStore.ts`
- Create: `src/wall/musicActions.ts`
- Create: `src/wall/musicActions.test.ts`
- Modify: `src/store/types.ts`
- Modify: `src/wall/WallView.tsx:107-125` (buildDoc) and `:213-221` (restore)

**Interfaces:**
- Consumes: `Station`, `STATIONS`, `nextStation`, `findStation` from Task 4.
- Produces: `MusicCard` (`kind: "music"; id; stationId: string; url: string; x; y; w; h`) in the `Card` union; `MUSIC_ID = "wall-music"`; `musicCard(): MusicCard | undefined`, `openMusic(phrase?: string): string`, `closeMusic(): string`, `changeStation(phrase?: string): string`, `setCustomUrl(url: string): void` from `src/wall/musicActions.ts`; `SavedMusic = { stationId: string; url: string; gridIndex: number }` and `music?: SavedMusic` on `WallDoc`. Tasks 7–8 consume these.

- [ ] **Step 1: Write the failing tests** — `src/wall/musicActions.test.ts` (mirrors `browserActions.test.ts`):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useCardStore } from "./cardStore";
import { STATIONS } from "./stations";
import { MUSIC_ID, changeStation, closeMusic, musicCard, openMusic, setCustomUrl } from "./musicActions";

beforeEach(() => {
  useCardStore.setState({ cards: [], anchor: null, maximizedId: null });
});

describe("openMusic", () => {
  it("opens one music card on the first station by default", () => {
    openMusic();
    const c = musicCard();
    expect(c?.id).toBe(MUSIC_ID);
    expect(c?.stationId).toBe(STATIONS[0].id);
    expect(c?.url).toBe(STATIONS[0].url);
    openMusic(); // idempotent: still exactly one card
    expect(useCardStore.getState().cards.filter((x) => x.kind === "music")).toHaveLength(1);
  });
  it("matches a requested mood/name", () => {
    openMusic(STATIONS[1].mood);
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });
  it("retunes an open card instead of erroring", () => {
    openMusic();
    openMusic(STATIONS[1].name);
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });
});

describe("changeStation", () => {
  it("cycles to the next station when no phrase is given", () => {
    openMusic();
    changeStation();
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });
  it("errors when the music card is closed", () => {
    expect(changeStation()).toMatch(/not open/i);
  });
});

describe("setCustomUrl / closeMusic", () => {
  it("marks pasted URLs as the custom station", () => {
    openMusic();
    setCustomUrl("https://example.com/stream");
    expect(musicCard()?.stationId).toBe("custom");
    expect(musicCard()?.url).toBe("https://example.com/stream");
  });
  it("closeMusic removes the card", () => {
    openMusic();
    closeMusic();
    expect(musicCard()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/musicActions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `MusicCard` to `src/wall/cardStore.ts`** — after `FileCard`:

```ts
/** The wall's single music/focus player; occupies a grid cell like a terminal. */
export type MusicCard = {
  kind: "music";
  id: string;
  /** Station id from STATIONS, or "custom" for a pasted stream URL. */
  stationId: string;
  /** The stream URL actually loaded. */
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Card = TerminalCard | BrowserCard | FileCard | MusicCard;
```

and extend `update`'s patch union with `| Partial<Omit<MusicCard, "kind" | "id">>`.

- [ ] **Step 4: Create `src/wall/musicActions.ts`**:

```ts
import { useCardStore, type MusicCard } from "./cardStore";
import { CELL } from "./gridLayout";
import { removeCardWithFade } from "./removeCard";
import { STATIONS, findStation, nextStation, type Station } from "./stations";

export const MUSIC_ID = "wall-music";

export function musicCard(): MusicCard | undefined {
  return useCardStore.getState().cards.find((c): c is MusicCard => c.kind === "music");
}

const tune = (s: Station) =>
  useCardStore.getState().update(MUSIC_ID, { stationId: s.id, url: s.url });

/** Opens the music card (grid re-flows) or retunes the open one. */
export function openMusic(phrase?: string): string {
  const station = (phrase ? findStation(phrase) : undefined) ?? STATIONS[0];
  if (musicCard()) {
    tune(station);
    return `Tuned to ${station.name} (${station.mood}).`;
  }
  useCardStore.getState().add({
    kind: "music",
    id: MUSIC_ID,
    stationId: station.id,
    url: station.url,
    x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
  });
  return `Opened the music player on ${station.name} (${station.mood}).`;
}

/** Next station on the dial, or a named/mood-matched one. */
export function changeStation(phrase?: string): string {
  const c = musicCard();
  if (!c) return "Error: the music player is not open.";
  const station = phrase?.trim() ? findStation(phrase) : nextStation(c.stationId);
  if (!station) {
    return `Error: no station matches "${phrase}". Stations: ${STATIONS.map((s) => `${s.name} (${s.mood})`).join(", ")}.`;
  }
  tune(station);
  return `Tuned to ${station.name} (${station.mood}).`;
}

/** A pasted stream URL becomes the "custom" station. */
export function setCustomUrl(url: string): void {
  if (musicCard()) useCardStore.getState().update(MUSIC_ID, { stationId: "custom", url: url.trim() });
}

export function closeMusic(): string {
  if (!musicCard()) return "The music player is not open.";
  removeCardWithFade(MUSIC_ID);
  return "Closed the music player.";
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/wall/musicActions.test.ts`
Expected: PASS. (`removeCardWithFade` works headless in jsdom — `browserActions.test.ts` already relies on it.)

- [ ] **Step 6: Persist per wall** — `src/store/types.ts`, after `SavedBrowser`:

```ts
export type SavedMusic = { stationId: string; url: string; gridIndex: number };
```

and on `WallDoc`, after `browser?`:

```ts
  /** The wall's music card, if open when last saved. Restores paused. */
  music?: SavedMusic;
```

In `src/wall/WallView.tsx` `buildDoc()` (line ~112), beside the browser lookup:

```ts
const music = cards.find((c) => c.kind === "music");
```

and in the returned object after `browser:`:

```ts
music: music ? { stationId: music.stationId, url: music.url, gridIndex: cards.indexOf(music) } : undefined,
```

In the restore effect (after the `doc?.browser` block, line ~221) — import `MUSIC_ID` from `./musicActions`:

```ts
if (doc?.music) {
  const i = Math.max(0, Math.min(doc.music.gridIndex, cards.length));
  cards.splice(i, 0, {
    kind: "music",
    id: MUSIC_ID,
    stationId: doc.music.stationId,
    url: doc.music.url,
    x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
  });
}
```

Playback state is deliberately NOT saved — a reopened wall restores the card paused (no surprise audio, same principle as boot recipes never auto-running).

- [ ] **Step 7: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add src/wall/cardStore.ts src/wall/musicActions.ts src/wall/musicActions.test.ts src/store/types.ts src/wall/WallView.tsx
git commit -m "feat(music): music card kind, actions, and per-wall persistence"
```

### Task 7: MusicWindow component + wiring (D4)

**Files:**
- Create: `src/wall/MusicWindow.tsx`
- Modify: `src/wall/TerminalOverlay.tsx` (render the new kind)
- Modify: `src/wall/icons.tsx` (MusicIcon, PlayIcon, PauseIcon, NextIcon)
- Modify: `src/wall/LaunchMenu.tsx` + `src/wall/WallView.tsx:830-834` (mouse path to open it)
- Modify: `src/App.css` (music card styles)

**Interfaces:**
- Consumes: `MusicCard` + `useCardStore` (Task 6), `musicActions` (`closeMusic`, `changeStation`, `setCustomUrl`, `openMusic`), `stations` (`STATIONS`), `eq` (`BAR_COUNT`, `barsFromBins`, `isSilent`, `simulateBars`), shared chrome CSS + `HEADER_H`, drag-to-reorder gesture (copied from `FileViewerWindow.tsx:44-76`).
- Produces: `MusicWindow` React component; no later task consumes new exports.

No unit tests for the component itself (all extracted logic was tested in Tasks 4–6); behavior is verified in Task 11. Type-safety gate still applies.

- [ ] **Step 1: Add icons** — append to `src/wall/icons.tsx`, matching the file's `Svg` helper style:

```tsx
export const MusicIcon = () => (
  <Svg><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Svg>
);
export const PlayIcon = () => <Svg><path d="m7 4 13 8-13 8z" /></Svg>;
export const PauseIcon = () => <Svg><path d="M7 4h3v16H7z" /><path d="M14 4h3v16h-3z" /></Svg>;
export const NextIcon = () => <Svg><path d="m5 4 10 8-10 8z" /><path d="M19 4v16" /></Svg>;
```

- [ ] **Step 2: Create `src/wall/MusicWindow.tsx`**:

```tsx
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { HEADER_H, type Camera } from "./transform";
import { useCardStore, type MusicCard } from "./cardStore";
import { CloseIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon } from "./icons";
import { nearestSlotIndex } from "./gridLayout";
import { changeStation, closeMusic, setCustomUrl } from "./musicActions";
import { STATIONS } from "./stations";
import { BAR_COUNT, barsFromBins, isSilent, simulateBars } from "./eq";

/** CORS-opaque streams keep the analyser at zero forever; after this long of
    zeros while playing, the EQ switches to the simulated bars. */
const SILENCE_TIMEOUT_MS = 2000;

function MusicWindowInner({ card, cameraRef }: { card: MusicCard; cameraRef: RefObject<Camera> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [urlDraft, setUrlDraft] = useState("");
  const station = STATIONS.find((s) => s.id === card.stationId);

  // One audio element for the card's lifetime; station changes just swap src.
  useEffect(() => {
    const el = new Audio();
    el.crossOrigin = "anonymous"; // lets same-CORS streams feed the analyser
    el.preload = "none";
    audioRef.current = el;
    return () => { el.pause(); el.src = ""; audioRef.current = null; };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const wasPlaying = playing;
    el.src = card.url;
    if (wasPlaying) void el.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.url]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    // AudioContext needs a user gesture; build the graph lazily on first play.
    if (!analyserRef.current) {
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      } catch { /* graph failed (rare) — simulated bars cover it */ }
    }
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  // EQ loop: real bins while they carry signal, simulated after a silent spell.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let silentSince: number | null = null;
    let bars = new Array(BAR_COUNT).fill(0.1);
    const bins = new Uint8Array((analyserRef.current?.frequencyBinCount ?? 128));
    const draw = (t: number) => {
      const analyser = analyserRef.current;
      let simulated = analyser === null;
      if (analyser) {
        analyser.getByteFrequencyData(bins);
        if (isSilent(bins)) {
          silentSince ??= t;
          simulated = t - silentSince > SILENCE_TIMEOUT_MS;
        } else silentSince = null;
      }
      bars = simulated ? simulateBars(bars, t) : barsFromBins(bins);
      const canvas = canvasRef.current;
      const g = canvas?.getContext("2d");
      if (canvas && g) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        const bw = canvas.width / BAR_COUNT;
        const accent = getComputedStyle(canvas).color; // canvas color: var(--accent)
        g.fillStyle = accent;
        bars.forEach((b, i) => {
          const h = Math.max(2, b * canvas.height);
          g.fillRect(i * bw + 2, canvas.height - h, bw - 4, h);
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const close = (e: ReactPointerEvent) => { e.stopPropagation(); closeMusic(); };

  // Same drag-to-reorder gesture as FileViewerWindow.
  const beginDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    e.stopPropagation();
    if (wrapRef.current) wrapRef.current.style.transition = "none";
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ox = card.x, oy = card.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z;
      ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const el = wrapRef.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
      const from = cards.findIndex((c) => c.id === card.id);
      if (slot !== -1 && slot !== from) moveToIndex(card.id, slot);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window music-window"
      data-card-id={card.id}
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="file-header-icon"><MusicIcon /></span>
        <span className="terminal-title">{station ? `${station.name} · ${station.mood}` : "Custom stream"}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}><CloseIcon /></button>
      </div>
      <div className="terminal-body music-body" style={{ top: HEADER_H, bottom: 0 }}>
        <canvas ref={canvasRef} className="music-eq" width={320} height={120} />
        <div className="music-controls">
          <button className="music-btn" title={playing ? "Pause" : "Play"} onPointerDown={(e) => { e.stopPropagation(); toggle(); }}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="music-btn" title="Next station" onPointerDown={(e) => { e.stopPropagation(); changeStation(); }}>
            <NextIcon />
          </button>
          <input
            className="music-volume" type="range" min={0} max={1} step={0.05} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
        <form
          className="music-custom"
          onSubmit={(e) => { e.preventDefault(); if (urlDraft.trim()) { setCustomUrl(urlDraft); setUrlDraft(""); } }}
        >
          <input
            className="music-url" placeholder="paste a stream url…" value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </form>
        <div className="music-attribution">{station?.attribution ?? card.url}</div>
      </div>
    </div>
  );
}

// Same shallow-compare rationale as TerminalWindow.
export const MusicWindow = memo(MusicWindowInner);
```

- [ ] **Step 3: Render the kind** — `src/wall/TerminalOverlay.tsx`, extend the card map:

```tsx
) : c.kind === "music" ? (
  <MusicWindow key={c.id} card={c} cameraRef={cameraRef} />
```

with `import { MusicWindow } from "./MusicWindow";`.

- [ ] **Step 4: Mouse path** — `src/wall/LaunchMenu.tsx`: add `onLaunchMusic: () => void` to the props and a menu entry after the Browser button:

```tsx
<button
  className="launch-item"
  onPointerDown={() => { setOpen(false); onLaunchMusic(); }}
>
  <span className="launch-ic" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
    <MusicIcon />
  </span>
  Music
</button>
```

(import `MusicIcon` from `./icons`). In `src/wall/WallView.tsx` pass it:

```tsx
onLaunchMusic={() => { openMusic(); }}
```

with `import { openMusic, closeMusic, changeStation, musicCard } from "./musicActions";` (the extra names are used in Task 8).

- [ ] **Step 5: Styles** — append to `src/App.css` after the browser-card block:

```css
/* ---- Music card ---- */
.music-body { display: flex; flex-direction: column; gap: 10px; padding: 14px; align-items: center; justify-content: center; }
.music-eq { width: 80%; height: 110px; color: var(--accent); }
.music-controls { display: flex; align-items: center; gap: 10px; }
.music-btn {
  width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--rule);
  border-radius: 50%; cursor: pointer; transition: color .14s, border-color .14s;
}
.music-btn:hover { color: var(--accent); border-color: var(--accent); }
.music-btn svg { width: 14px; height: 14px; }
.music-volume { width: 120px; accent-color: var(--accent); }
.music-custom { width: 80%; }
.music-url {
  width: 100%; box-sizing: border-box; background: rgba(0, 0, 0, .35);
  border: 1px solid var(--rule); border-radius: 6px; padding: 5px 9px;
  color: var(--text-muted); font: 500 10.5px var(--font-mono); outline: none;
}
.music-url:focus { border-color: var(--accent); }
.music-attribution { font: 500 9px var(--font-mono); color: var(--text-faint); }
```

- [ ] **Step 6: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add src/wall/MusicWindow.tsx src/wall/TerminalOverlay.tsx src/wall/icons.tsx src/wall/LaunchMenu.tsx src/wall/WallView.tsx src/App.css
git commit -m "feat(music): music card window with EQ visualization"
```

### Task 8: Music voice commands + hint (D4)

**Files:**
- Modify: `src/wall/musicActions.ts` (player registry + play/stop)
- Modify: `src/wall/musicActions.test.ts`
- Modify: `src/wall/MusicWindow.tsx` (register the player)
- Modify: `src/wall/WallView.tsx` (four `useVibeCommand`s + wall context line)
- Modify: `src/vibe/hints.ts` + `src/vibe/hints.test.ts`

**Interfaces:**
- Consumes: Task 6's actions, Task 7's `MusicWindow`.
- Produces: `registerPlayer(p: { play: () => void; pause: () => void } | null)`, `playMusic(phrase?: string): Promise<string>`, `stopMusic(): string` in `musicActions.ts`; Vibe commands `play_music`, `change_station`, `stop_music`, `close_music`.

Playback lives inside `MusicWindow` (it owns the `<audio>`), so voice control goes through a module-level player registry: the window registers its play/pause on every render (closures stay fresh) and `playMusic` polls briefly for registration when it just created the card.

- [ ] **Step 1: Write the failing tests** — append to `src/wall/musicActions.test.ts`:

```ts
import { playMusic, registerPlayer, stopMusic } from "./musicActions";

describe("playMusic / stopMusic", () => {
  it("opens the card and starts the registered player", async () => {
    let played = 0;
    registerPlayer({ play: () => { played++; }, pause: () => {} });
    const msg = await playMusic();
    expect(musicCard()).toBeDefined();
    expect(played).toBe(1);
    expect(msg).toMatch(/playing/i);
    registerPlayer(null);
  });
  it("still opens the card when no player registers in time", async () => {
    registerPlayer(null);
    const msg = await playMusic("lofi");
    expect(musicCard()).toBeDefined();
    expect(msg).toMatch(/press play/i);
  });
  it("stopMusic pauses without closing", () => {
    let paused = 0;
    registerPlayer({ play: () => {}, pause: () => { paused++; } });
    openMusic();
    expect(stopMusic()).toMatch(/paused/i);
    expect(paused).toBe(1);
    expect(musicCard()).toBeDefined();
    registerPlayer(null);
  });
});
```

(The "no player" test must not wait the full poll — see the `POLL_MS` export below; in the test file set it via `vi.useFakeTimers()` OR simply accept the ~600ms real wait. Prefer the real wait: it's one test and keeps the module timer-free.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/musicActions.test.ts`
Expected: FAIL — `playMusic` is not exported.

- [ ] **Step 3: Extend `src/wall/musicActions.ts`** — append:

```ts
/** The mounted MusicWindow's transport; null when no card is mounted. */
type Player = { play: () => void; pause: () => void };
let player: Player | null = null;
export function registerPlayer(p: Player | null): void { player = p; }

/** Voice entry point: open (or retune) the card, then start playback once the
    window has mounted and registered its transport. */
export async function playMusic(phrase?: string): Promise<string> {
  const opened = openMusic(phrase);
  for (let i = 0; i < 12 && !player; i++) await new Promise((r) => setTimeout(r, 50));
  if (!player) return `${opened} Press play to start.`;
  player.play();
  return opened.replace(/^(Opened the music player on|Tuned to)/, "Playing");
}

/** Pause without closing the card. */
export function stopMusic(): string {
  if (!musicCard()) return "The music player is not open.";
  player?.pause();
  return "Music paused.";
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/musicActions.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the player in `src/wall/MusicWindow.tsx`** — add to the imports `registerPlayer` from `./musicActions`, split `toggle` so play/pause are callable directly (replace the existing `toggle` with):

```tsx
const start = () => {
  const el = audioRef.current;
  if (!el || playing) return;
  if (!analyserRef.current) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
    } catch { /* graph failed (rare) — simulated bars cover it */ }
  }
  void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
};
const stop = () => { audioRef.current?.pause(); setPlaying(false); };
const toggle = () => (playing ? stop() : start());

// Voice transport: re-register every render so the closures see current state.
useEffect(() => {
  registerPlayer({ play: start, pause: stop });
  return () => registerPlayer(null);
});
```

- [ ] **Step 6: Voice commands in `src/wall/WallView.tsx`** — after the `close_browser` command, using the Task 7 import line (`openMusic` unused now — swap it for these):

```tsx
useVibeCommand({
  name: "play_music",
  description:
    "Open the music player and start a station. Use when the user asks to play music / focus sounds; optionally pass what they asked for (e.g. 'lofi', 'synthwave').",
  parameters: {
    type: "object",
    properties: { station: { type: "string", description: "Station name or mood (optional)" } },
  },
  run: (args) => playMusic(args.station ? String(args.station) : undefined),
});

useVibeCommand({
  name: "change_station",
  description: "Switch the music player to the next station, or to a named one.",
  parameters: {
    type: "object",
    properties: { station: { type: "string", description: "Station name or mood (optional)" } },
  },
  run: (args) => changeStation(args.station ? String(args.station) : undefined),
});

useVibeCommand({
  name: "stop_music",
  description: "Pause the music without closing the player.",
  run: () => stopMusic(),
});

useVibeCommand({
  name: "close_music",
  description: "Close the music player card.",
  run: () => closeMusic(),
});
```

Imports used from `./musicActions`: `playMusic, stopMusic, changeStation, closeMusic, openMusic, musicCard, MUSIC_ID` (openMusic stays for the LaunchMenu path; `musicCard` for the context line below).

Extend the `useVibeContext("wall", …)` snapshot (line ~480), beside the browser line:

```tsx
const music = cards.some((c) => c.kind === "music") ? "; music player open" : "";
```

and append `${music}` to the returned string.

- [ ] **Step 7: Hint** — `src/vibe/hints.ts`: change the last push to

```ts
hints.push(`Try "apply the Ember theme"`, `Try "play some music"`, `Try "open the task board"`);
```

and add to `src/vibe/hints.test.ts` (follow its existing assertion style):

```ts
it("suggests the music player", () => {
  expect(buildHints([], []).some((h) => h.includes("play some music"))).toBe(true);
});
```

- [ ] **Step 8: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add src/wall/musicActions.ts src/wall/musicActions.test.ts src/wall/MusicWindow.tsx src/wall/WallView.tsx src/vibe/hints.ts src/vibe/hints.test.ts
git commit -m "feat(music): play/stop/change-station voice commands"
```

### Task 9: Minimap projection math (D3)

**Files:**
- Create: `src/wall/minimap.ts`
- Create: `src/wall/minimap.test.ts`

**Interfaces:**
- Consumes: `Rect` from `src/wall/transform.ts`.
- Produces: `minimapProject(cards: Rect[], viewport: Rect, box: { w: number; h: number; pad: number }): { cards: Rect[]; viewport: Rect; toWorld: (p: { x: number; y: number }) => { x: number; y: number } }`. Task 10's component consumes it.

- [ ] **Step 1: Write the failing tests** — `src/wall/minimap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { minimapProject } from "./minimap";

const BOX = { w: 180, h: 120, pad: 8 };

describe("minimapProject", () => {
  it("fits all cards and the viewport inside the padded box", () => {
    const cards = [
      { x: -500, y: -200, w: 600, h: 440 },
      { x: 200, y: 300, w: 600, h: 440 },
    ];
    const viewport = { x: -100, y: -100, w: 1200, h: 800 };
    const m = minimapProject(cards, viewport, BOX);
    for (const r of [...m.cards, m.viewport]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(BOX.w);
      expect(r.y + r.h).toBeLessThanOrEqual(BOX.h);
    }
  });

  it("preserves aspect: uniform scale on both axes", () => {
    const cards = [{ x: 0, y: 0, w: 100, h: 100 }];
    const viewport = { x: 0, y: 0, w: 400, h: 100 };
    const m = minimapProject(cards, viewport, BOX);
    expect(m.cards[0].w).toBeCloseTo(m.cards[0].h, 6);
  });

  it("toWorld inverts the projection", () => {
    const cards = [{ x: 50, y: 80, w: 600, h: 440 }];
    const viewport = { x: -1000, y: -500, w: 2000, h: 1200 };
    const m = minimapProject(cards, viewport, BOX);
    const p = { x: m.cards[0].x, y: m.cards[0].y };
    const w = m.toWorld(p);
    expect(w.x).toBeCloseTo(50, 4);
    expect(w.y).toBeCloseTo(80, 4);
  });

  it("handles zero cards (viewport only)", () => {
    const m = minimapProject([], { x: 0, y: 0, w: 1000, h: 600 }, BOX);
    expect(m.cards).toEqual([]);
    expect(m.viewport.w).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/minimap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/wall/minimap.ts`**:

```ts
import type { Rect } from "./transform";

/**
 * Projects world-space card rects + the camera viewport into a fixed minimap
 * box: union bounds, uniform scale (fit), centered. toWorld inverts a minimap
 * point back to world coordinates for click-to-jump.
 */
export function minimapProject(
  cards: Rect[],
  viewport: Rect,
  box: { w: number; h: number; pad: number }
): { cards: Rect[]; viewport: Rect; toWorld: (p: { x: number; y: number }) => { x: number; y: number } } {
  const all = [...cards, viewport];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of all) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const scale = Math.min((box.w - 2 * box.pad) / bw, (box.h - 2 * box.pad) / bh);
  const ox = (box.w - bw * scale) / 2 - x0 * scale;
  const oy = (box.h - bh * scale) / 2 - y0 * scale;
  const map = (r: Rect): Rect => ({ x: r.x * scale + ox, y: r.y * scale + oy, w: r.w * scale, h: r.h * scale });
  return {
    cards: cards.map(map),
    viewport: map(viewport),
    toWorld: (p) => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale }),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/minimap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/minimap.ts src/wall/minimap.test.ts
git commit -m "feat(minimap): pure world<->minimap projection"
```

### Task 10: Minimap component + island toggle + setting (D3)

**Files:**
- Create: `src/wall/Minimap.tsx`
- Modify: `src/settings/settings.ts` + `src/settings/settings.test.ts` (`canvas.minimap`)
- Modify: `src/wall/ToolsIsland.tsx` (toggle button)
- Modify: `src/wall/icons.tsx` (MapIcon)
- Modify: `src/wall/WallView.tsx` (mount + jump + toggle wiring)
- Modify: `src/App.css` (minimap styles)

**Interfaces:**
- Consumes: `minimapProject` (Task 9), `useCardStore`, `presetTierColor`, `Camera`/`Rect`, `useSettingsStore`.
- Produces: `Minimap` component; `settings.canvas.minimap: boolean` (default `true`); `ToolsIsland` props gain `minimapOn: boolean; onToggleMinimap: () => void`.

- [ ] **Step 1: Write the failing settings test** — append to the `mergeSettings` describe in `src/settings/settings.test.ts`:

```ts
it("defaults canvas.minimap to true and respects a stored false", () => {
  expect(mergeSettings({}).canvas.minimap).toBe(true);
  expect(mergeSettings({ canvas: { minimap: false } }).canvas.minimap).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: FAIL — `minimap` missing from the type/merge.

- [ ] **Step 3: Add the setting** — `src/settings/settings.ts`:

```ts
canvas: { defaultBackground: Background; minimap: boolean };
```

default:

```ts
canvas: { defaultBackground: DEFAULT_BACKGROUND, minimap: true },
```

merge:

```ts
canvas: {
  defaultBackground: isBackground(canvas.defaultBackground)
    ? canvas.defaultBackground
    : d.canvas.defaultBackground,
  minimap: bool(canvas.minimap, d.canvas.minimap),
},
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/wall/Minimap.tsx`**:

```tsx
import { useEffect, useState, type RefObject } from "react";
import { useCardStore, type Card } from "./cardStore";
import type { Camera, Rect } from "./transform";
import { minimapProject } from "./minimap";
import { presetTierColor } from "./presetTier";

const BOX = { w: 180, h: 120, pad: 8 };
/** Below this window width the minimap hides itself — no room for it. */
const MIN_WINDOW_W = 900;
/** Camera polling cadence: pan/zoom bypasses React, so the minimap samples the ref. */
const TICK_MS = 150;

const colorOf = (c: Card): string =>
  c.kind === "terminal" ? presetTierColor(c.presetId)
  : c.kind === "browser" ? "var(--info)"
  : c.kind === "music" ? "var(--accent)"
  : "var(--text-faint)";

export function Minimap({ cameraRef, rootRef, onJump }: {
  cameraRef: RefObject<Camera>;
  rootRef: RefObject<HTMLDivElement | null>;
  onJump: (world: { x: number; y: number }) => void;
}) {
  const cards = useCardStore((s) => s.cards);
  const [viewport, setViewport] = useState<Rect | null>(null);

  useEffect(() => {
    const tick = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const cam = cameraRef.current;
      const next =
        rect && rect.width >= MIN_WINDOW_W
          ? { x: -cam.x, y: -cam.y, w: rect.width / cam.z, h: rect.height / cam.z }
          : null;
      setViewport((prev) =>
        prev && next && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
          ? prev
          : next
      );
    };
    tick();
    const t = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(t);
  }, [cameraRef, rootRef]);

  if (cards.length === 0 || !viewport) return null;
  const m = minimapProject(cards.map(({ x, y, w, h }) => ({ x, y, w, h })), viewport, BOX);
  return (
    <svg
      className="minimap"
      width={BOX.w}
      height={BOX.h}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(m.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }));
      }}
    >
      {m.cards.map((r, i) => (
        <rect
          key={cards[i].id}
          x={r.x} y={r.y}
          width={Math.max(2, r.w)} height={Math.max(2, r.h)}
          rx={1.5} fill={colorOf(cards[i])} opacity={0.55}
        />
      ))}
      <rect
        x={m.viewport.x} y={m.viewport.y} width={m.viewport.w} height={m.viewport.h}
        fill="none" stroke="var(--accent)" strokeWidth={1.5} rx={2}
      />
    </svg>
  );
}
```

- [ ] **Step 6: MapIcon + island toggle** — `src/wall/icons.tsx`:

```tsx
export const MapIcon = () => (
  <Svg><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></Svg>
);
```

`src/wall/ToolsIsland.tsx` — extend the props and append after the tool buttons:

```tsx
import { TOOLS, type ToolDef } from "./tools";
import { TOOL_ICONS, MapIcon } from "./icons";

export function ToolsIsland({
  activeType, onSelect, minimapOn, onToggleMinimap,
}: {
  activeType: string;
  onSelect: (tool: ToolDef) => void;
  minimapOn: boolean;
  onToggleMinimap: () => void;
}) {
  return (
    <div className="tools-island" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.type];
        return (
          <button
            key={t.type}
            className={`tool-key${t.type === activeType ? " active" : ""}`}
            aria-pressed={t.type === activeType}
            title={`${t.label} · ${t.shortcut}`}
            onPointerDown={() => onSelect(t)}
          >
            <Icon />
          </button>
        );
      })}
      <span className="tools-divider" />
      <button
        className={`tool-key${minimapOn ? " active" : ""}`}
        aria-pressed={minimapOn}
        title="Minimap"
        onPointerDown={onToggleMinimap}
      >
        <MapIcon />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Wire into `src/wall/WallView.tsx`** — imports: `Minimap` from `./Minimap`. Inside the component:

```tsx
const settings = useSettingsStore((s) => s.settings);
const saveSettings = useSettingsStore((s) => s.save);
const minimapOn = settings.canvas.minimap;

/** Minimap click: center the clicked world point at the current zoom. */
const jumpTo = useCallback((w: { x: number; y: number }) => {
  const rect = rootRef.current?.getBoundingClientRect();
  if (!rect) return;
  const z = cameraRef.current.z;
  animateCamera({ x: rect.width / (2 * z) - w.x, y: rect.height / (2 * z) - w.y, z });
}, [animateCamera]);
```

(If `useSettingsStore` selectors already exist under other names in WallView, reuse them instead of duplicating.) Update the JSX:

```tsx
<ToolsIsland
  activeType={activeType}
  onSelect={selectTool}
  minimapOn={minimapOn}
  onToggleMinimap={() => saveSettings({ ...settings, canvas: { ...settings.canvas, minimap: !minimapOn } })}
/>
{minimapOn && <Minimap cameraRef={cameraRef} rootRef={rootRef} onJump={jumpTo} />}
```

Check `src/settings/settingsStore.ts` for the save method's exact name/signature before wiring (`save` per `SettingsModal.tsx:347`).

- [ ] **Step 8: Styles** — append to `src/App.css`:

```css
/* ---- Minimap ---- */
.minimap {
  position: absolute; right: 14px; bottom: 14px; z-index: 290;
  background: var(--glass); backdrop-filter: blur(10px);
  border: 1px solid var(--rule); border-radius: var(--radius-sm);
  box-shadow: var(--shadow); cursor: pointer;
}
.tools-divider { width: 1px; height: 18px; background: var(--rule); margin: 0 3px; flex: none; }
```

- [ ] **Step 9: Gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add src/wall/Minimap.tsx src/settings/settings.ts src/settings/settings.test.ts src/wall/ToolsIsland.tsx src/wall/icons.tsx src/wall/WallView.tsx src/App.css
git commit -m "feat(minimap): click-to-jump wall minimap with island toggle"
```

### Task 11: Real-app verification + docs + graph

**Files:**
- Modify: `docs/cnvs-parity-roadmap.md` (Package D status)
- Modify: assistant memory `project_cnvs_parity.md`
- No product code except fixes for issues this task uncovers.

**Interfaces:**
- Consumes: everything above, in the running app.

- [ ] **Step 1: Launch the dev instance**

`npm run app` (background). This is a SEPARATE instance (window title "Tauri App", app-data dir `com.admin.vibe-space-dev`) — NEVER touch the user's running Vibe Space. Drive it with `.dev/click2.ps1` (window-relative clicks) + `scripts/screenshot.ps1`.

- [ ] **Step 2: Verify D1 — scenes**

Open Settings → Themes: the Scenes group shows 8 pixel-art cards. Apply "Meadow Night": wall background swaps, accent recolors (buttons/highlights shift to the scene accent), pixels stay crisp (no blur). Screenshot. Also say/type-check the voice path once TTS is up (Step 6) or via `apply_theme` through the Vibe agent.

- [ ] **Step 3: Verify D2 — glow + chrome**

Open a Claude terminal, send it a prompt so it streams: the card's border glows accent and breathes (~3s) while output flows, and settles when idle. Header is 24px with ghosted buttons that appear on hover. Screenshot working vs idle side by side.

- [ ] **Step 4: Verify D4 — music card**

Launch menu → Music: card opens paused, station name + attribution visible. Press play: audio streams, EQ bars move (note in the summary whether bars are real or simulated — CORS decides). Next-station cycles; paste a custom URL; volume slider works. Close + reopen the wall: the card restores PAUSED at the same station. **If voice-initiated playback is blocked by autoplay policy** (play_music opens the card but audio stays paused): add `"additionalBrowserArguments": "--autoplay-policy=no-user-gesture-required"` to the window config in `src-tauri/tauri.conf.json` AND `src-tauri/tauri.dev.conf.json`, restart the dev instance, and re-verify.

- [ ] **Step 5: Verify D3 — minimap**

With 3+ cards open: minimap sits bottom-right showing card rects + accent viewport frame. Pan/zoom the canvas — the viewport rect tracks. Click a far card's rect: camera glides to it. Toggle off via the island button; restart the dev instance and confirm the preference stuck.

- [ ] **Step 6: Voice sweep (hands-free via Windows TTS through the speakers)**

"play some music" → player opens + plays (or opens paused per autoplay findings); "change the station"; "stop the music"; "close the music player"; "apply the campfire theme". All five should round-trip through the Vibe pipeline.

- [ ] **Step 7: Clean up the dev instance**

Kill spawned PTY shells, close the instance, and delete test terminals/cards it saved into `%APPDATA%/com.admin.vibe-space-dev/spaces/*.json`.

- [ ] **Step 8: Update the roadmap + memory + graph**

- `docs/cnvs-parity-roadmap.md`: Package D row → **DONE (2026-07-15)**; add a "What exists now" summary at the top of § 5 in the style of Packages A–C (scene library + accents, chrome glow, music card + voice, minimap; note the real-vs-simulated EQ finding and any autoplay config change).
- Assistant memory `project_cnvs_parity.md`: mark D done, note all four packages complete.
- Run `graphify update .`.

- [ ] **Step 9: Final gates + commit**

Run: `npx tsc --noEmit -p tsconfig.json` then `npx vitest run` — both pass.

```bash
git add docs/cnvs-parity-roadmap.md
git commit -m "docs(roadmap): Package D looks-and-delight complete"
```

Do NOT push; the user decides when to push to the `Vibe_ADE` remote.

