import { ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import type { CommandBlock } from '@shared/types';
import { isDestructiveCommand } from '@main/services/CommandSafety';
import type { TemplateRunner } from '@main/services/TemplateRunner';
import type { TerminalManager } from '@main/services/TerminalManager';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';
import { buildMentionPayload, listDirectoryEntries } from '@main/services/TerminalMentionPayload';
import {
  assertExistingPath,
  assertPaneId,
  assertRecord,
  assertWorkspaceCwd,
  assertWorkspaceId
} from './shared/validators';

const MAX_COMMAND_LENGTH = 8_000;
const MAX_INPUT_LENGTH = 64_000;
const MIN_TERMINAL_COLS = 2;
const MIN_TERMINAL_ROWS = 1;
const MAX_TERMINAL_COLS = 500;
const MAX_TERMINAL_ROWS = 200;

function assertCommand(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid command');
  }
  if (value.length > MAX_COMMAND_LENGTH || value.includes('\0')) {
    throw new Error('Invalid command payload');
  }
}

function assertTerminalInput(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_INPUT_LENGTH || value.includes('\0')) {
    throw new Error('Invalid terminal input payload');
  }
}

function clampTerminalDimension(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, rounded));
}

interface Deps {
  workspaceManager: WorkspaceManager;
  terminalManager: TerminalManager;
  templateRunner: TemplateRunner;
  webContents: WebContents;
}

export function registerTerminalHandlers({ workspaceManager, terminalManager, templateRunner, webContents }: Deps): void {
  terminalManager.onData((paneId, data) => {
    webContents.send('terminal:data', { paneId, data });
  });

  terminalManager.onExit((paneId, exitCode) => {
    webContents.send('terminal:exit', { paneId, exitCode });
  });

  terminalManager.onCommandCompleted((payload) => {
    webContents.send('terminal:commandCompleted', payload);
  });

  templateRunner.onProgress((event) => {
    webContents.send('template:progress', event);
  });

  const loadWorkspace = (workspaceId: string) => {
    const state = workspaceManager.list();
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return workspace;
  };

  ipcMain.handle('terminal:startSession', (_event, input) => {
    assertPaneId(input?.paneId);
    assertWorkspaceCwd(workspaceManager, input?.cwd);
    const cols = clampTerminalDimension(input?.cols, 120, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS);
    const rows = clampTerminalDimension(input?.rows, 30, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS);
    terminalManager.startSession({ ...input, cols, rows });
  });

  ipcMain.handle('terminal:stopSession', (_event, paneId: string) => {
    assertPaneId(paneId);
    terminalManager.stopSession(paneId);
  });

  ipcMain.handle('terminal:sendInput', (_event, paneId: string, input: string) => {
    assertPaneId(paneId);
    assertTerminalInput(input);
    terminalManager.sendInput(paneId, input);
  });

  ipcMain.handle('terminal:executeInSession', (_event, paneId: string, command: string, forceSubmit?: boolean) => {
    assertPaneId(paneId);
    assertCommand(command);
    terminalManager.executeInSession(paneId, command, forceSubmit);
  });

  ipcMain.handle('terminal:resize', (_event, paneId: string, cols: number, rows: number) => {
    assertPaneId(paneId);
    const safeCols = clampTerminalDimension(cols, 120, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS);
    const safeRows = clampTerminalDimension(rows, 30, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS);
    terminalManager.resize(paneId, safeCols, safeRows);
  });

  ipcMain.handle('terminal:getSessionSnapshot', (_event, paneId: string) => {
    assertPaneId(paneId);
    return terminalManager.getSessionSnapshot(paneId);
  });

  ipcMain.handle('terminal:runStructuredCommand', async (_event, input): Promise<CommandBlock & { warning?: string }> => {
    assertPaneId(input?.paneId);
    assertWorkspaceCwd(workspaceManager, input?.cwd);
    assertCommand(input?.command);
    const block = await terminalManager.runStructuredCommand(input);
    if (isDestructiveCommand(input.command)) {
      return {
        ...block,
        warning: 'Destructive command detected. Review carefully before re-running.'
      };
    }
    return block;
  });

  ipcMain.handle('terminal:listDirectory', async (_event, input: unknown) => {
    assertRecord(input, 'terminal listDirectory payload');
    const workspaceId = input.workspaceId;
    assertWorkspaceId(workspaceId);
    const directoryValue = input.directory;
    assertExistingPath(directoryValue, 'directory', 'dir');
    const directory = path.resolve(directoryValue);
    return listDirectoryEntries(directory);
  });

  ipcMain.handle('terminal:buildMentionPayload', async (_event, input: unknown) => {
    assertRecord(input, 'terminal buildMentionPayload payload');
    const workspaceId = input.workspaceId;
    assertWorkspaceId(workspaceId);
    const workspace = loadWorkspace(workspaceId);
    const targetPathValue = input.targetPath;
    assertExistingPath(targetPathValue, 'targetPath', 'any');
    const targetPath = path.resolve(targetPathValue);

    const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
      const rounded = Math.floor(value);
      if (!Number.isFinite(rounded)) return fallback;
      return Math.max(min, Math.min(max, rounded));
    };

    const tree = input.tree as Record<string, unknown> | undefined;
    const keyFiles = input.keyFiles as Record<string, unknown> | undefined;

    const payload = await buildMentionPayload(workspace.rootDir, targetPath, {
      tree: {
        maxDepth: clamp(tree?.maxDepth, 4, 0, 10),
        maxEntries: clamp(tree?.maxEntries, 1200, 50, 20_000),
        maxLines: clamp(tree?.maxLines, 400, 20, 5000)
      },
      keyFiles: {
        maxFiles: clamp(keyFiles?.maxFiles, 6, 0, 50),
        maxCharsPerFile: clamp(keyFiles?.maxCharsPerFile, 2200, 200, 50_000)
      },
      maxTotalChars: clamp(input.maxTotalChars, 60_000, 5_000, 250_000)
    });

    return payload;
  });
}
