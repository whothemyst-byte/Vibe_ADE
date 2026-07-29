/** Device artboard presets and where a new one lands. Pure — no React or
 *  Excalidraw imports, so the geometry is testable in node. */

export type FramePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export type FramePresetGroup = {
  label: string;
  presets: FramePreset[];
};

/** Point sizes as the device reports them to CSS, which is what a UI mockup is
 *  drawn in — not raw pixel counts. */
export const FRAME_PRESET_GROUPS: FramePresetGroup[] = [
  {
    label: "Phone",
    presets: [
      { id: "iphone-16-pro", label: "iPhone 16 Pro", width: 402, height: 874 },
      { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440, height: 956 },
      { id: "iphone-se", label: "iPhone SE", width: 320, height: 568 },
      { id: "android-compact", label: "Android Compact", width: 412, height: 917 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { id: "ipad-mini", label: "iPad mini 8.3\"", width: 744, height: 1133 },
      { id: "ipad-pro-11", label: "iPad Pro 11\"", width: 834, height: 1194 },
      { id: "ipad-pro-13", label: "iPad Pro 13\"", width: 1024, height: 1366 },
    ],
  },
  {
    label: "Laptop",
    presets: [
      { id: "macbook-air", label: "MacBook Air", width: 1280, height: 832 },
      { id: "macbook-pro-14", label: "MacBook Pro 14\"", width: 1512, height: 982 },
      { id: "macbook-pro-16", label: "MacBook Pro 16\"", width: 1728, height: 1117 },
    ],
  },
  {
    label: "Desktop",
    presets: [
      { id: "desktop", label: "Desktop", width: 1440, height: 1024 },
      { id: "desktop-hd", label: "Desktop HD", width: 1920, height: 1080 },
      { id: "imac-24", label: "iMac 24\"", width: 2240, height: 1260 },
    ],
  },
  {
    label: "TV",
    presets: [
      { id: "tv-1080p", label: "TV 1080p", width: 1920, height: 1080 },
      { id: "tv-4k", label: "TV 4K", width: 3840, height: 2160 },
    ],
  },
  {
    label: "Watch",
    presets: [
      { id: "watch-41", label: "Apple Watch 41mm", width: 176, height: 215 },
      { id: "watch-45", label: "Apple Watch 45mm", width: 198, height: 242 },
      { id: "watch-ultra", label: "Apple Watch Ultra", width: 205, height: 251 },
      { id: "wear-os", label: "Wear OS Small", width: 192, height: 192 },
    ],
  },
];

export const FRAME_PRESETS: FramePreset[] = FRAME_PRESET_GROUPS.flatMap((g) => g.presets);

/** Gap left between artboards laid out side by side, in scene units. */
export const FRAME_GAP = 80;

export type FrameBox = { x: number; y: number; width: number; height: number };

export type Viewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

/** Where to drop a new artboard: to the right of every existing one, aligned to
 *  the topmost, so repeated inserts read as a filmstrip. With no frames yet it
 *  lands centred in what the user is currently looking at.
 *  Excalidraw's mapping is `scene = viewport / zoom - scroll`. */
export function framePlacement(
  frames: readonly FrameBox[],
  size: { width: number; height: number },
  view: Viewport,
): { x: number; y: number } {
  if (frames.length === 0) {
    const centreX = view.width / 2 / view.zoom - view.scrollX;
    const centreY = view.height / 2 / view.zoom - view.scrollY;
    return { x: centreX - size.width / 2, y: centreY - size.height / 2 };
  }
  const right = Math.max(...frames.map((f) => f.x + f.width));
  const top = Math.min(...frames.map((f) => f.y));
  return { x: right + FRAME_GAP, y: top };
}

/** Figma-style naming: the preset label, then " 2", " 3"… once taken. Keeping
 *  names distinct matters here because agents address frames by name. */
export function nextFrameName(existing: readonly string[], label: string): string {
  const taken = new Set(existing);
  if (!taken.has(label)) return label;
  let n = 2;
  while (taken.has(`${label} ${n}`)) n++;
  return `${label} ${n}`;
}
