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
    for (let i = 0; i < 900; i++) { // wheat speckle over the field bands
      const y = 162 + Math.floor(rng() * (H - 162));
      px.add(Math.floor(rng() * W), y, hex("#e8c060"), 0.12 + rng() * 0.18);
    }
    rect(px, 330, 150, 44, 34, "#3a2412"); // farmhouse
    rect(px, 322, 142, 60, 8, "#2a1a0e"); // roof
    rect(px, 366, 128, 6, 16, "#2a1a0e"); // chimney
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
          if (rng() < 0.28) { px.set(wx, wy, hex("#e8b45c")); px.set(wx + 1, wy, hex("#e8b45c")); }
      x += w + 2 + Math.floor(rng() * 6);
    }
    glow(px, 240, 268, 120, "#c9741f", 0.25); // city glow from below
  },
  "tea-room"(px) {
    const rng = mulberry32(88);
    sky(px, ["#2c211a", "#3a2c20", "#463526"], 0, H); // warm wall
    const win = new Px(); sky(win, ["#131019", "#241d2a"], 0, H); // night outside
    for (let y = 50; y < 160; y++) for (let x = 300; x < 420; x++) px.set(x, y, win.get(x, y));
    for (let i = 0; i < 25; i++) px.add(305 + Math.floor(rng() * 110), 52 + Math.floor(rng() * 60), hex("#f3eee5"), 0.6);
    rect(px, 296, 46, 128, 4, "#1c1006"); rect(px, 296, 160, 128, 5, "#1c1006"); // frame
    rect(px, 358, 50, 3, 110, "#1c1006"); // mullion
    rect(px, 40, 96, 150, 5, "#1c1006"); // shelf
    let bx = 48; // book spines on the shelf
    const spines = ["#7a4a20", "#a5772e", "#5e3a18", "#c06a30", "#8a5f22", "#6b4718", "#a5772e", "#7a4a20", "#c9963f", "#5e3a18", "#8a5f22", "#c06a30"];
    for (const c of spines) {
      const bw = 7 + Math.floor(rng() * 5), bh = 18 + Math.floor(rng() * 9);
      rect(px, bx, 96 - bh, bw, bh, c);
      bx += bw + 1;
    }
    rect(px, 216, 130, 34, 26, "#1c1006"); // picture frame
    rect(px, 219, 133, 28, 20, "#463526");
    glow(px, 233, 143, 8, "#e8a050", 0.5); // little dune print
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
