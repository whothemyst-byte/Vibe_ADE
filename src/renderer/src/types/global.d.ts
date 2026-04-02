import type * as React from 'react';
import type { VibeAdeApi } from '@shared/ipc';

declare global {
  interface Window {
    vibeAde: VibeAdeApi;
  }

  interface HTMLWebViewElement extends HTMLElement {
    getURL(): string;
    getTitle(): string;
    getWebContentsId(): number;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    loadURL(url: string): void;
    openDevTools(options?: { mode?: 'right' | 'bottom' | 'detach' }): void;
    addEventListener(
      type: 'did-start-loading' | 'did-stop-loading' | 'did-navigate' | 'did-navigate-in-page' | 'page-title-updated' | 'new-window' | 'dom-ready' | 'did-fail-load' | 'will-navigate',
      listener: (event: Event & { url?: string; title?: string; preventDefault?: () => void }) => void
    ): void;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement> & {
        src?: string;
        allowpopups?: boolean;
        partition?: string;
        style?: React.CSSProperties;
      };
    }
  }
}

export {};
