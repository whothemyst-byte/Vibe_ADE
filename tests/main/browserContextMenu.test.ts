import { describe, expect, it, vi } from 'vitest';
import { buildBrowserContextMenuTemplate } from '../../src/main/services/browserContextMenu';

describe('browserContextMenu', () => {
  it('builds a browser-style page menu with expected actions', () => {
    const actions = {
      goBack: vi.fn(),
      goForward: vi.fn(),
      reload: vi.fn(),
      savePage: vi.fn(),
      printPage: vi.fn(),
      openViewSource: vi.fn(),
      openInspect: vi.fn()
    };

    const template = buildBrowserContextMenuTemplate(
      {
        pageUrl: 'https://example.com',
        canGoBack: true,
        canGoForward: false
      },
      actions
    );

    const labels = template.filter((item) => item.type !== 'separator').map((item) => item.label);
    expect(labels).toEqual([
      'Back',
      'Forward',
      'Reload',
      'Save as...',
      'Print...',
      'Cast...',
      'Search this tab with Google Lens',
      'Open in reading mode',
      'Send to your devices',
      'Create QR Code for this page',
      'Translate to English',
      'View page source',
      'Inspect'
    ]);

    expect(template.find((item) => item.label === 'Back')?.enabled).toBe(true);
    expect(template.find((item) => item.label === 'Forward')?.enabled).toBe(false);
    expect(template.find((item) => item.label === 'Save as...')?.enabled).toBe(true);
    expect(template.find((item) => item.label === 'Cast...')?.enabled).toBe(false);
  });

  it('disables page actions when the browser is blank', () => {
    const template = buildBrowserContextMenuTemplate(
      {
        pageUrl: 'about:blank',
        canGoBack: false,
        canGoForward: false
      },
      {
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        savePage: vi.fn(),
        printPage: vi.fn(),
        openViewSource: vi.fn(),
        openInspect: vi.fn()
      }
    );

    expect(template.find((item) => item.label === 'Save as...')?.enabled).toBe(false);
    expect(template.find((item) => item.label === 'View page source')?.enabled).toBe(false);
  });
});
