import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import type { CommandBlock, PaneId, ShellType } from '@shared/types';

interface TerminalSession {
  paneId: PaneId;
  shell: ShellType;
  cwd: string;
  process: pty.IPty;
}

function getShellCommand(shell: ShellType): { file: string; args: string[] } {
  if (shell === 'cmd') {
    return { file: 'cmd.exe', args: ['/Q'] };
  }
  return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'] };
}

function getExecArgs(shell: ShellType, command: string): { file: string; args: string[] } {
  if (shell === 'cmd') {
    return { file: 'cmd.exe', args: ['/D', '/S', '/C', command] };
  }
  return { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] };
}

function looksLikePowerShellCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  return (
    /^([A-Za-z]+-+[A-Za-z]+)/.test(trimmed) ||
    /^\$[A-Za-z_][A-Za-z0-9_]*/.test(trimmed) ||
    /\$\w+/.test(trimmed) ||
    /\|\s*Where-Object\b/i.test(trimmed) ||
    /\|\s*ForEach-Object\b/i.test(trimmed)
  );
}

function buildPowerShellProxyCommand(command: string): string {
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

export class TerminalManager {
  private readonly sessions = new Map<PaneId, TerminalSession>();
  private readonly emitter = new EventEmitter();
  private readonly stalePidPath: string;
  private trackedPids = new Set<number>();

  constructor(userDataDir: string) {
    this.stalePidPath = path.join(userDataDir, 'terminal-session-pids.json');
  }

  async initialize(): Promise<void> {
    await this.cleanupStaleSessions();
    await this.persistTrackedPids();
  }

  onData(listener: (paneId: PaneId, data: string) => void): () => void {
    this.emitter.on('data', listener);
    return () => this.emitter.off('data', listener);
  }

  onExit(listener: (paneId: PaneId, exitCode: number) => void): () => void {
    this.emitter.on('exit', listener);
    return () => this.emitter.off('exit', listener);
  }

  startSession(input: { paneId: PaneId; shell: ShellType; cwd: string }): void {
    this.stopSession(input.paneId);

    const shell = getShellCommand(input.shell);
    const proc = pty.spawn(shell.file, shell.args, {
      name: 'xterm-256color',
      cwd: input.cwd,
      cols: 120,
      rows: 30,
      env: process.env as Record<string, string>
    });

    const session: TerminalSession = {
      paneId: input.paneId,
      shell: input.shell,
      cwd: input.cwd,
      process: proc
    };

    proc.onData((data) => this.emitter.emit('data', input.paneId, data));
    proc.onExit((e) => {
      this.emitter.emit('exit', input.paneId, e.exitCode);
      this.sessions.delete(input.paneId);
      this.untrackPid(proc.pid);
    });

    this.sessions.set(input.paneId, session);
    this.trackPid(proc.pid);
  }

  stopSession(paneId: PaneId): void {
    const session = this.sessions.get(paneId);
    if (!session) {
      return;
    }
    session.process.kill();
    this.sessions.delete(paneId);
    this.untrackPid(session.process.pid);
  }

  sendInput(paneId: PaneId, input: string): void {
    const session = this.sessions.get(paneId);
    if (!session) {
      throw new Error(`No terminal session for pane ${paneId}`);
    }
    session.process.write(input);
  }

  executeInSession(paneId: PaneId, command: string, forceSubmit = false): void {
    const session = this.sessions.get(paneId);
    if (!session) {
      throw new Error(`No terminal session for pane ${paneId}`);
    }
    const nextCommand =
      session.shell === 'cmd' && looksLikePowerShellCommand(command) ? buildPowerShellProxyCommand(command) : command;
    // Write command and submit key separately to better mimic interactive key input for TUI/REPL CLIs.
    session.process.write(nextCommand);
    session.process.write('\r');
    if (forceSubmit) {
      setTimeout(() => {
        const current = this.sessions.get(paneId);
        if (current) {
          current.process.write('\r');
        }
      }, 25);
    }
  }

  resize(paneId: PaneId, cols: number, rows: number): void {
    const session = this.sessions.get(paneId);
    if (!session) {
      return;
    }
    session.process.resize(cols, rows);
  }

  runStructuredCommand(input: { paneId: PaneId; shell: ShellType; cwd: string; command: string }): Promise<CommandBlock> {
    const start = new Date();
    const block: CommandBlock = {
      id: uuidv4(),
      paneId: input.paneId,
      command: input.command,
      output: '',
      exitCode: null,
      startedAt: start.toISOString(),
      collapsed: true
    };

    const execArgs = getExecArgs(input.shell, input.command);
    return new Promise((resolve, reject) => {
      const proc = spawn(execArgs.file, execArgs.args, {
        cwd: input.cwd,
        env: process.env,
        windowsHide: true
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        const data = chunk.toString('utf8');
        block.output += data;
        this.emitter.emit('data', input.paneId, data);
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const data = chunk.toString('utf8');
        block.output += data;
        this.emitter.emit('data', input.paneId, data);
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        block.exitCode = code ?? -1;
        block.completedAt = new Date().toISOString();
        resolve(block);
      });
    });
  }

  async shutdown(): Promise<void> {
    for (const paneId of this.sessions.keys()) {
      this.stopSession(paneId);
    }
    this.trackedPids.clear();
    await this.persistTrackedPids();
  }

  private trackPid(pid: number): void {
    if (!pid || pid <= 0) {
      return;
    }
    this.trackedPids.add(pid);
    void this.persistTrackedPids();
  }

  private untrackPid(pid: number): void {
    if (!pid || pid <= 0) {
      return;
    }
    this.trackedPids.delete(pid);
    void this.persistTrackedPids();
  }

  private async cleanupStaleSessions(): Promise<void> {
    const stalePids = await this.readTrackedPids();
    for (const pid of stalePids) {
      try {
        // Check if process exists
        process.kill(pid, 0);
        // Process exists, kill it
        process.kill(pid);
        console.info(`Cleaned up stale terminal process: ${pid}`);
      } catch (error) {
        // Process doesn't exist or can't be killed - this is expected
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ESRCH' && nodeError.code !== 'EPERM') {
          console.warn(`Error cleaning up process ${pid}:`, error);
        }
      }
    }
  }

  private async readTrackedPids(): Promise<number[]> {
    try {
      const raw = await fs.readFile(this.stalePidPath, 'utf8');
      const trimmed = raw.trim();
      if (!trimmed) {
        return [];
      }

      const parsed = JSON.parse(trimmed) as { pids?: number[] } | number[];
      if (Array.isArray(parsed)) {
        return parsed.filter((pid) => Number.isInteger(pid) && pid > 0);
      }
      return parsed.pids?.filter((pid) => Number.isInteger(pid) && pid > 0) ?? [];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        return [];
      }

      // Recover from partially corrupted/concatenated JSON and avoid noisy startup stack traces.
      try {
        const raw = await fs.readFile(this.stalePidPath, 'utf8');
        const recoveredPids = this.extractPidsFromCorruptedPayload(raw);
        if (recoveredPids.length > 0) {
          console.warn(`Tracked PID file was malformed; recovered ${recoveredPids.length} PID(s).`);
          return recoveredPids;
        }
      } catch {
        // Ignore recovery failures and continue with a clean state.
      }

      if (error instanceof SyntaxError) {
        console.warn('Tracked PID file is malformed. Resetting tracked PID state.');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to read tracked PIDs: ${message}`);
      }
      return [];
    }
  }

  private extractPidsFromCorruptedPayload(raw: string): number[] {
    const recovered = new Set<number>();
    const pidArrayPattern = /"pids"\s*:\s*\[([^\]]*)\]/g;
    for (const match of raw.matchAll(pidArrayPattern)) {
      const content = match[1];
      for (const token of content.split(',')) {
        const value = Number.parseInt(token.trim(), 10);
        if (Number.isInteger(value) && value > 0) {
          recovered.add(value);
        }
      }
    }
    return [...recovered];
  }

  private async persistTrackedPids(): Promise<void> {
    const tempPath = `${this.stalePidPath}.tmp`;
    const payload = JSON.stringify({ version: 1, pids: [...this.trackedPids] }, null, 2);
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, this.stalePidPath);
  }
}
