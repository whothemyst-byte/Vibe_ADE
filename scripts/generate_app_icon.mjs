import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(process.cwd());
const OUT_DIR = path.join(ROOT, 'build');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value | 0));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '').trim();
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16)
  };
}

function blendOver(dst, src) {
  const srcA = src.a / 255;
  const dstA = dst.a / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (src.r * srcA + dst.r * dstA * (1 - srcA)) / outA,
    g: (src.g * srcA + dst.g * dstA * (1 - srcA)) / outA,
    b: (src.b * srcA + dst.b * dstA * (1 - srcA)) / outA,
    a: outA * 255
  };
}

function createImage(width, height) {
  return {
    width,
    height,
    data: new Uint8Array(width * height * 4)
  };
}

function getPixel(image, x, y) {
  const idx = (y * image.width + x) * 4;
  return {
    r: image.data[idx],
    g: image.data[idx + 1],
    b: image.data[idx + 2],
    a: image.data[idx + 3]
  };
}

function setPixel(image, x, y, rgba) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const idx = (y * image.width + x) * 4;
  image.data[idx] = clampByte(rgba.r);
  image.data[idx + 1] = clampByte(rgba.g);
  image.data[idx + 2] = clampByte(rgba.b);
  image.data[idx + 3] = clampByte(rgba.a);
}

function drawPixel(image, x, y, rgba) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const dst = getPixel(image, x, y);
  const out = blendOver(dst, rgba);
  setPixel(image, x, y, out);
}

function fillRect(image, x, y, w, h, rgba) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      drawPixel(image, xx, yy, rgba);
    }
  }
}

function fillRoundedRect(image, x, y, w, h, r, rgba) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  const rr = Math.max(0, r);

  // Simple 4-sample AA for corners.
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];

  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      let covered = 0;
      for (const [sx, sy] of samples) {
        const px = xx + sx;
        const py = yy + sy;
        const cx = Math.min(Math.max(px, x + rr), x + w - rr);
        const cy = Math.min(Math.max(py, y + rr), y + h - rr);
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= rr * rr) {
          covered++;
        }
      }
      if (covered === 0) continue;
      const a = (rgba.a * covered) / 4;
      drawPixel(image, xx, yy, { ...rgba, a });
    }
  }
}

function strokeRoundedRect(image, x, y, w, h, r, strokeWidth, rgba) {
  fillRoundedRect(image, x, y, w, h, r, rgba);
  fillRoundedRect(image, x + strokeWidth, y + strokeWidth, w - strokeWidth * 2, h - strokeWidth * 2, Math.max(0, r - strokeWidth), {
    r: 0,
    g: 0,
    b: 0,
    a: 0
  });
}

function drawLine(image, x0, y0, x1, y1, thickness, rgba) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) | 0;
  if (steps <= 0) return;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(x0, x1, t);
    const y = lerp(y0, y1, t);
    fillRoundedRect(image, Math.round(x - thickness / 2), Math.round(y - thickness / 2), thickness, thickness, thickness / 2, rgba);
  }
}

function drawBackground(image) {
  const c0 = hexToRgb('#0B1220');
  const c1 = hexToRgb('#070A10');
  const glow = hexToRgb('#3B82F6');
  const w = image.width;
  const h = image.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const ny = y / (h - 1);
      const t = (nx * 0.55 + ny * 0.45);
      const r = lerp(c0.r, c1.r, t);
      const g = lerp(c0.g, c1.g, t);
      const b = lerp(c0.b, c1.b, t);

      // Radial accent glow in upper-left.
      const gx = (x - w * 0.36) / (w * 0.62);
      const gy = (y - h * 0.28) / (h * 0.62);
      const gd = Math.sqrt(gx * gx + gy * gy);
      const ga = Math.max(0, 1 - gd);
      const gr = r + glow.r * ga * 0.14;
      const gg = g + glow.g * ga * 0.14;
      const gb = b + glow.b * ga * 0.14;

      setPixel(image, x, y, { r: gr, g: gg, b: gb, a: 255 });
    }
  }
}

function renderIconBase(size) {
  const img = createImage(size, size);
  drawBackground(img);

  const tile = {
    x: Math.round(size * 0.086),
    y: Math.round(size * 0.086),
    w: Math.round(size * 0.828),
    h: Math.round(size * 0.828),
    r: Math.round(size * 0.188)
  };

  // Mask into rounded tile by clearing outside region.
  const tmp = createImage(size, size);
  fillRoundedRect(tmp, tile.x, tile.y, tile.w, tile.h, tile.r, { r: 255, g: 255, b: 255, a: 255 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = getPixel(tmp, x, y).a;
      if (m === 0) {
        setPixel(img, x, y, { r: 0, g: 0, b: 0, a: 0 });
      }
    }
  }

  // Tile border.
  const accent = hexToRgb('#3B82F6');
  const border = { r: accent.r, g: accent.g, b: accent.b, a: 54 };
  const borderW = Math.max(2, Math.round(size * 0.01));
  fillRoundedRect(img, tile.x, tile.y, tile.w, tile.h, tile.r, border);
  fillRoundedRect(img, tile.x + borderW, tile.y + borderW, tile.w - borderW * 2, tile.h - borderW * 2, Math.max(0, tile.r - borderW), {
    r: 0,
    g: 0,
    b: 0,
    a: 0
  });

  // Inner panel.
  const inner = {
    x: Math.round(size * 0.18),
    y: Math.round(size * 0.18),
    w: Math.round(size * 0.64),
    h: Math.round(size * 0.64),
    r: Math.round(size * 0.082)
  };
  fillRoundedRect(img, inner.x, inner.y, inner.w, inner.h, inner.r, { r: 10, g: 15, b: 27, a: 255 });
  strokeRoundedRect(img, inner.x, inner.y, inner.w, inner.h, inner.r, Math.max(2, Math.round(size * 0.006)), { r: 35, g: 49, b: 75, a: 210 });

  // 2x2 panes.
  const panePad = Math.round(size * 0.04);
  const paneOverlap = Math.round(size * 0.04);
  const paneW = Math.floor((inner.w - panePad * 2 + paneOverlap) / 2);
  const paneH = Math.floor((inner.h - panePad * 2 + paneOverlap) / 2);
  const paneR = Math.round(size * 0.047);
  const paneStroke = { r: 39, g: 50, b: 74, a: 220 };
  const paneFillA = { r: 19, g: 26, b: 43, a: 255 };
  const paneFillB = { r: 11, g: 19, b: 37, a: 255 };

  const p1 = { x: inner.x + panePad, y: inner.y + panePad };
  const p2 = { x: inner.x + panePad + paneW - paneOverlap, y: inner.y + panePad };
  const p3 = { x: inner.x + panePad, y: inner.y + panePad + paneH - paneOverlap };
  const p4 = { x: inner.x + panePad + paneW - paneOverlap, y: inner.y + panePad + paneH - paneOverlap };

  const paneStrokeW = Math.max(1, Math.round(size * 0.004));
  for (const [i, p] of [p1, p2, p3, p4].entries()) {
    fillRoundedRect(img, p.x, p.y, paneW, paneH, paneR, i % 3 === 0 ? paneFillA : paneFillB);
    strokeRoundedRect(img, p.x, p.y, paneW, paneH, paneR, paneStrokeW, paneStroke);
  }

  // Dividers.
  const divider = { r: 30, g: 43, b: 68, a: 210 };
  const dividerW = Math.max(2, Math.round(size * 0.012));
  drawLine(
    img,
    inner.x + inner.w / 2,
    inner.y + panePad * 0.6,
    inner.x + inner.w / 2,
    inner.y + inner.h - panePad * 0.6,
    dividerW,
    divider
  );
  drawLine(
    img,
    inner.x + panePad * 0.6,
    inner.y + inner.h / 2,
    inner.x + inner.w - panePad * 0.6,
    inner.y + inner.h / 2,
    dividerW,
    divider
  );

  // Prompt glyph in top-left pane.
  const yellow = hexToRgb('#FBBF24');
  const promptStroke = { r: yellow.r, g: yellow.g, b: yellow.b, a: 235 };
  const promptThick = Math.max(6, Math.round(size * 0.03));
  const baseX = p1.x + Math.round(paneW * 0.22);
  const baseY = p1.y + Math.round(paneH * 0.34);
  drawLine(img, baseX, baseY, baseX + Math.round(paneW * 0.18), baseY + Math.round(paneH * 0.14), promptThick, promptStroke);
  drawLine(
    img,
    baseX + Math.round(paneW * 0.18),
    baseY + Math.round(paneH * 0.14),
    baseX,
    baseY + Math.round(paneH * 0.28),
    promptThick,
    promptStroke
  );
  const sky = hexToRgb('#93C5FD');
  fillRoundedRect(
    img,
    p1.x + Math.round(paneW * 0.48),
    p1.y + Math.round(paneH * 0.58),
    Math.round(paneW * 0.34),
    Math.max(6, Math.round(size * 0.02)),
    Math.round(size * 0.015),
    { r: sky.r, g: sky.g, b: sky.b, a: 210 }
  );

  // V mark in bottom-right pane.
  const accentStroke = { r: accent.r, g: accent.g, b: accent.b, a: 240 };
  const vThick = Math.max(7, Math.round(size * 0.036));
  const vx0 = p4.x + Math.round(paneW * 0.34);
  const vy0 = p4.y + Math.round(paneH * 0.32);
  const vx1 = p4.x + Math.round(paneW * 0.5);
  const vy1 = p4.y + Math.round(paneH * 0.78);
  const vx2 = p4.x + Math.round(paneW * 0.66);
  const vy2 = p4.y + Math.round(paneH * 0.32);
  drawLine(img, vx0, vy0, vx1, vy1, vThick, accentStroke);
  drawLine(img, vx1, vy1, vx2, vy2, vThick, accentStroke);

  // Small nodes.
  const cyan = hexToRgb('#22D3EE');
  const purple = hexToRgb('#C084FC');
  const green = hexToRgb('#34D399');
  fillRoundedRect(img, p2.x + Math.round(paneW * 0.52), p2.y + Math.round(paneH * 0.34), Math.round(size * 0.04), Math.round(size * 0.04), Math.round(size * 0.02), {
    r: cyan.r,
    g: cyan.g,
    b: cyan.b,
    a: 220
  });
  fillRoundedRect(img, p2.x + Math.round(paneW * 0.7), p2.y + Math.round(paneH * 0.56), Math.round(size * 0.03), Math.round(size * 0.03), Math.round(size * 0.015), {
    r: purple.r,
    g: purple.g,
    b: purple.b,
    a: 210
  });
  fillRoundedRect(img, p3.x + Math.round(paneW * 0.52), p3.y + Math.round(paneH * 0.55), Math.round(size * 0.032), Math.round(size * 0.032), Math.round(size * 0.016), {
    r: green.r,
    g: green.g,
    b: green.b,
    a: 210
  });

  return img;
}

function resizeBox(src, dstW, dstH) {
  const dst = createImage(dstW, dstH);
  const scaleX = src.width / dstW;
  const scaleY = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.floor(x * scaleX);
      const sy0 = Math.floor(y * scaleY);
      const sx1 = Math.min(src.width, Math.floor((x + 1) * scaleX));
      const sy1 = Math.min(src.height, Math.floor((y + 1) * scaleY));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const idx = (yy * src.width + xx) * 4;
          r += src.data[idx];
          g += src.data[idx + 1];
          b += src.data[idx + 2];
          a += src.data[idx + 3];
          count++;
        }
      }
      if (count === 0) continue;
      setPixel(dst, x, y, { r: r / count, g: g / count, b: b / count, a: a / count });
    }
  }
  return dst;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = u32be(d.length);
  const crc = u32be(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

function encodePng(image) {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    const start = y * stride;
    const end = (y + 1) * stride;
    raw.set(data.subarray(start, end), y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeIco(pngFrames) {
  const count = pngFrames.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + dir.length;
  const payloads = [];

  pngFrames.forEach((frame, i) => {
    const entryOffset = i * 16;
    dir[entryOffset + 0] = frame.width >= 256 ? 0 : frame.width;
    dir[entryOffset + 1] = frame.height >= 256 ? 0 : frame.height;
    dir[entryOffset + 2] = 0;
    dir[entryOffset + 3] = 0;
    dir.writeUInt16LE(1, entryOffset + 4); // planes
    dir.writeUInt16LE(32, entryOffset + 6); // bpp
    dir.writeUInt32LE(frame.data.length, entryOffset + 8);
    dir.writeUInt32LE(offset, entryOffset + 12);

    payloads.push(frame.data);
    offset += frame.data.length;
  });

  return Buffer.concat([header, dir, ...payloads]);
}

function writeIfChanged(filePath, buffer) {
  try {
    const existing = fs.readFileSync(filePath);
    if (Buffer.compare(existing, buffer) === 0) return;
  } catch {
    // ignore
  }
  fs.writeFileSync(filePath, buffer);
}

function main() {
  ensureDir(OUT_DIR);

  // Render at a high base size for cleaner downscales.
  const sizes = [256, 128, 64, 32, 16];

  const writeIconSet = (base, prefix) => {
    const png512 = encodePng(base);
    writeIfChanged(path.join(OUT_DIR, `${prefix}.png`), png512);

    const frames = sizes.map((s) => {
      const img = resizeBox(base, s, s);
      return { width: s, height: s, data: encodePng(img) };
    });
    const ico = encodeIco(frames);
    writeIfChanged(path.join(OUT_DIR, `${prefix}.ico`), ico);

    const png128 = encodePng(resizeBox(base, 128, 128));
    writeIfChanged(path.join(OUT_DIR, `${prefix}-128.png`), png128);
  };

  writeIconSet(renderIconBase(512), 'icon');
}

main();
