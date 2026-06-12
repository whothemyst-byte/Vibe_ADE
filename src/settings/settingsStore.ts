import { create } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { loadSettings, saveSettings } from "../store/persistence";

type SettingsStore = {
  settings: Settings;
  load: () => Promise<void>;
  /** Sets state immediately (subscribers react) and persists in the background. */
  save: (next: Settings) => void;
};

/* Persisting goes through Tauri IPC and a full file write; debounce it so
   typing in a settings field doesn't hit the disk on every keystroke. */
const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  load: async () => {
    try {
      const loaded = await loadSettings();
      // First run (or pre-deviceId settings file): mint a stable anonymous id
      // for the Groq proxy quota and persist it.
      if (!loaded.vibe.deviceId) {
        loaded.vibe.deviceId = crypto.randomUUID();
        void saveSettings(loaded).catch(() => {});
      }
      set({ settings: loaded });
    } catch {
      /* keep defaults if the backend isn't reachable */
    }
  },
  save: (next) => {
    set({ settings: next });
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void saveSettings(next).catch(() => {
        /* persisting is best-effort; state already updated */
      });
    }, PERSIST_DEBOUNCE_MS);
  },
}));
