import { create } from "zustand";
import { DEFAULT_PRESETS, type Preset } from "./presets";
import { loadPresets } from "../store/persistence";

type PresetStore = { presets: Preset[]; load: () => Promise<void> };

export const usePresetStore = create<PresetStore>((set) => ({
  presets: DEFAULT_PRESETS,
  load: async () => {
    try {
      set({ presets: await loadPresets() });
    } catch {
      /* keep defaults if the backend isn't reachable */
    }
  },
}));
