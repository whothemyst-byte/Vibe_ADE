import { create } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { loadSettings, saveSettings } from "../store/persistence";

type SettingsStore = {
  settings: Settings;
  load: () => Promise<void>;
  /** Sets state immediately (subscribers react) and persists in the background. */
  save: (next: Settings) => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  load: async () => {
    try {
      set({ settings: await loadSettings() });
    } catch {
      /* keep defaults if the backend isn't reachable */
    }
  },
  save: (next) => {
    set({ settings: next });
    void saveSettings(next).catch(() => {
      /* persisting is best-effort; state already updated */
    });
  },
}));
