import type { VibeAdeApi } from '@shared/ipc';

declare global {
  interface Window {
    vibeAde: VibeAdeApi;
  }
}

export {};