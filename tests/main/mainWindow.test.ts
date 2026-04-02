import { beforeEach, describe, expect, it, vi } from 'vitest';

  const { browserWindowMock, existsSyncMock, webContentsOnMock, loadURLMock, setMenuBarVisibilityMock, setTitleMock, onMock } = vi.hoisted(() => {
  const webContentsOnMock = vi.fn();
  const loadURLMock = vi.fn();
  const setMenuBarVisibilityMock = vi.fn();
  const setTitleMock = vi.fn();
  const onMock = vi.fn();

  return {
    browserWindowMock: vi.fn(),
    existsSyncMock: vi.fn(() => false),
    webContentsOnMock,
    loadURLMock,
    setMenuBarVisibilityMock,
    setTitleMock,
    onMock
  };
});

vi.mock('node:fs', () => ({
  default: {
    existsSync: existsSyncMock
  },
  existsSync: existsSyncMock
}));

vi.mock('node:path', () => ({
  default: {
    join: (...parts: Array<string | undefined>) =>
      parts.filter((part): part is string => typeof part === 'string').join('/')
  },
  join: (...parts: Array<string | undefined>) =>
    parts.filter((part): part is string => typeof part === 'string').join('/')
}));

vi.mock('electron', () => ({
  BrowserWindow: browserWindowMock.mockImplementation((options) => {
    const webContents = {
      on: webContentsOnMock,
      session: {
        webRequest: {
          onHeadersReceived: vi.fn()
        }
      }
    };

    const win = {
      loadURL: loadURLMock,
      loadFile: vi.fn(),
      setMenuBarVisibility: setMenuBarVisibilityMock,
      on: onMock,
      setTitle: setTitleMock,
      webContents
    };

    return win;
  })
}));

import { createMainWindow } from '../../src/main/windows/mainWindow';

describe('createMainWindow', () => {
  beforeEach(() => {
    browserWindowMock.mockClear();
    existsSyncMock.mockClear();
    webContentsOnMock.mockClear();
    loadURLMock.mockClear();
    setMenuBarVisibilityMock.mockClear();
    setTitleMock.mockClear();
    onMock.mockClear();
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('keeps the native menu hidden while allowing Alt-modified shortcuts', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

    const win = createMainWindow();

    expect(browserWindowMock).toHaveBeenCalledTimes(1);
    expect(browserWindowMock.mock.calls[0]?.[0]).toMatchObject({
      autoHideMenuBar: false,
      backgroundColor: '#131722',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: true
      }
    });
    expect(setMenuBarVisibilityMock).toHaveBeenCalledWith(false);
    expect(loadURLMock).toHaveBeenCalledWith('http://localhost:5173');

    const beforeInputHandler = webContentsOnMock.mock.calls.find((entry) => entry[0] === 'before-input-event')?.[1] as
      | ((event: { preventDefault: () => void }, input: { type: string; key: string; control?: boolean; shift?: boolean; meta?: boolean; modifiers?: string[] }) => void)
      | undefined;

    expect(beforeInputHandler).toBeDefined();

    const bareAltPreventDefault = vi.fn();
    beforeInputHandler?.({ preventDefault: bareAltPreventDefault }, { type: 'keyDown', key: 'Alt' });
    expect(bareAltPreventDefault).toHaveBeenCalledTimes(1);

    const chordPreventDefault = vi.fn();
    beforeInputHandler?.(
      { preventDefault: chordPreventDefault },
      { type: 'keyDown', key: 'Alt', control: true, modifiers: ['control', 'alt'] }
    );
    expect(chordPreventDefault).not.toHaveBeenCalled();
    expect(win).toBeDefined();
  });
});
