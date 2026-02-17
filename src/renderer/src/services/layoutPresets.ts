export type LayoutPresetId =
  | '1-pane'
  | '2-pane-vertical'
  | '2-pane-horizontal'
  | '3-pane-left-large'
  | '4-pane-grid'
  | '6-pane-grid'
  | '8-pane-grid'
  | '12-pane-grid'
  | '16-pane-grid';

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  slots: number;
  columns: number;
  rows: number;
  featured?: boolean;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: '1-pane', label: '1 Pane (Full Screen)', slots: 1, columns: 1, rows: 1, featured: true },
  { id: '2-pane-vertical', label: '2 Pane Vertical', slots: 2, columns: 2, rows: 1, featured: true },
  { id: '2-pane-horizontal', label: '2 Pane Horizontal', slots: 2, columns: 1, rows: 2, featured: true },
  { id: '3-pane-left-large', label: '3 Pane (Left Large + 2 Right)', slots: 3, columns: 2, rows: 2, featured: true },
  { id: '4-pane-grid', label: '4 Pane Grid (2x2)', slots: 4, columns: 2, rows: 2 },
  { id: '6-pane-grid', label: '6 Pane Grid', slots: 6, columns: 3, rows: 2 },
  { id: '8-pane-grid', label: '8 Pane Grid', slots: 8, columns: 4, rows: 2 },
  { id: '12-pane-grid', label: '12 Pane Grid', slots: 12, columns: 4, rows: 3 },
  { id: '16-pane-grid', label: '16 Pane Grid', slots: 16, columns: 4, rows: 4 }
];

export interface PaneSlot {
  slotIndex: number;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
}

function createUniformSlots(columns: number, rows: number, count: number): PaneSlot[] {
  const slots: PaneSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const column = (i % columns) + 1;
    const row = Math.floor(i / columns) + 1;
    slots.push({
      slotIndex: i,
      columnStart: column,
      columnSpan: 1,
      rowStart: row,
      rowSpan: 1
    });
  }
  return slots;
}

export function getPresetById(id: LayoutPresetId): LayoutPreset {
  const preset = LAYOUT_PRESETS.find((item) => item.id === id);
  return preset ?? LAYOUT_PRESETS[0];
}

export function getPresetSlots(presetId: LayoutPresetId): PaneSlot[] {
  if (presetId === '3-pane-left-large') {
    return [
      { slotIndex: 0, columnStart: 1, columnSpan: 1, rowStart: 1, rowSpan: 2 },
      { slotIndex: 1, columnStart: 2, columnSpan: 1, rowStart: 1, rowSpan: 1 },
      { slotIndex: 2, columnStart: 2, columnSpan: 1, rowStart: 2, rowSpan: 1 }
    ];
  }

  const preset = getPresetById(presetId);
  return createUniformSlots(preset.columns, preset.rows, preset.slots);
}
