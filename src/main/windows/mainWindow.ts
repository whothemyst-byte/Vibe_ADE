import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function resolveWindowIconPath(): string | undefined {
  const candidates: string[] = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(process.cwd(), 'build', 'icon.ico')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function createMainWindow(): BrowserWindow {
  const iconPath = resolveWindowIconPath();

  const win = new BrowserWindow({
    width: 1680,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: '',
    ...(iconPath ? { icon: iconPath } : {}),
    autoHideMenuBar: true,
    backgroundColor: '#131722',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    const candidates = [
      path.join(__dirname, '../../out/renderer/index.html'),
      path.join(__dirname, '../renderer/index.html'),
      path.join(__dirname, '../../renderer/index.html')
    ];

    const rendererEntry = candidates.find((candidate) => fs.existsSync(candidate));
    if (rendererEntry) {
      void win.loadFile(rendererEntry);
    } else {
      void win.loadURL(
        `data:text/html,${encodeURIComponent(
          '<h2>Vibe-ADE failed to find renderer bundle.</h2><p>Expected out/renderer/index.html in packaged build.</p>'
        )}`
      );
    }
  }

  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (event) => event.preventDefault());
  win.setTitle('');

  // Add Content Security Policy for security (only in production)
  // In development, Vite needs inline scripts for HMR
  if (!process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "font-src 'self'; " +
            "connect-src 'self'; " +
            "media-src 'self';"
          ]
        }
      });
    });
  }

  return win;
}
