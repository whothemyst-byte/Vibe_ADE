import { BrowserWindow, Menu, dialog, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';

export interface BrowserContextMenuActions {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  savePage: () => Promise<void>;
  printPage: () => void;
  openViewSource: () => Promise<void>;
  openInspect: () => void;
}

export interface BrowserContextMenuState {
  pageUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

function isBlankUrl(url: string): boolean {
  const trimmed = url.trim();
  return !trimmed || trimmed === 'about:blank';
}

export function buildBrowserContextMenuTemplate(
  state: BrowserContextMenuState,
  actions: BrowserContextMenuActions
): MenuItemConstructorOptions[] {
  const saveEnabled = !isBlankUrl(state.pageUrl);

  return [
    {
      label: 'Back',
      accelerator: 'Alt+Left Arrow',
      enabled: state.canGoBack,
      click: () => actions.goBack()
    },
    {
      label: 'Forward',
      accelerator: 'Alt+Right Arrow',
      enabled: state.canGoForward,
      click: () => actions.goForward()
    },
    {
      label: 'Reload',
      accelerator: 'Ctrl+R',
      click: () => actions.reload()
    },
    { type: 'separator' },
    {
      label: 'Save as...',
      accelerator: 'Ctrl+S',
      enabled: saveEnabled,
      click: () => void actions.savePage()
    },
    {
      label: 'Print...',
      accelerator: 'Ctrl+P',
      enabled: saveEnabled,
      click: () => actions.printPage()
    },
    {
      label: 'Cast...',
      enabled: false
    },
    {
      label: 'Search this tab with Google Lens',
      enabled: false
    },
    {
      label: 'Open in reading mode',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Send to your devices',
      enabled: false
    },
    {
      label: 'Create QR Code for this page',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Translate to English',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'View page source',
      accelerator: 'Ctrl+U',
      enabled: saveEnabled,
      click: () => actions.openViewSource()
    },
    {
      label: 'Inspect',
      accelerator: 'Ctrl+Shift+I',
      click: () => actions.openInspect()
    }
  ];
}

async function saveBrowserPage(webContents: WebContents, pageUrl: string): Promise<void> {
  const parentWindow = BrowserWindow.fromWebContents(webContents) ?? BrowserWindow.getFocusedWindow() ?? undefined;
  let defaultPath = 'page';
  try {
    const parsed = new URL(pageUrl);
    defaultPath = parsed.hostname || parsed.pathname.replace(/[\\/]/g, '_') || 'page';
  } catch {
    defaultPath = 'page';
  }
  const result = await dialog.showSaveDialog(parentWindow, {
    defaultPath: `${defaultPath}.html`,
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePath) {
    return;
  }
  await webContents.savePage(result.filePath, 'HTMLComplete');
}

function getContextUrl(params: ContextMenuParams, webContents: WebContents): string {
  return params.linkURL || params.srcURL || params.pageURL || webContents.getURL() || 'about:blank';
}

function popupBrowserMenu(webContents: WebContents, params: ContextMenuParams): void {
  const url = getContextUrl(params, webContents);
  const menu = Menu.buildFromTemplate(
    buildBrowserContextMenuTemplate(
      {
        pageUrl: url,
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward()
      },
      {
        goBack: () => webContents.goBack(),
        goForward: () => webContents.goForward(),
        reload: () => webContents.reload(),
        savePage: async () => saveBrowserPage(webContents, url),
        printPage: () => {
          webContents.print({ silent: false, printBackground: true });
        },
        openViewSource: async () => {
          const pageTitle = webContents.getTitle() || url;
          const sourceHtml = await webContents.executeJavaScript('document.documentElement.outerHTML', true).catch(() => '');
          const target = BrowserWindow.fromWebContents(webContents)?.webContents;
          target?.send('browser:contextAction', {
            webContentsId: webContents.id,
            action: 'view-source',
            url,
            sourceHtml,
            pageTitle
          });
        },
        openInspect: () => {
          webContents.inspectElement(params.x, params.y);
        }
      }
    )
  );

  const parentWindow = BrowserWindow.fromWebContents(webContents) ?? BrowserWindow.getFocusedWindow() ?? undefined;
  menu.popup({
    window: parentWindow,
    x: params.x,
    y: params.y
  });
}

export function installBrowserContextMenus(embedderWebContents: WebContents): void {
  embedderWebContents.on('did-attach-webview', (_event, webContents: WebContents) => {
    webContents.on('context-menu', (_event, params) => {
      popupBrowserMenu(webContents, params);
    });
  });
}
