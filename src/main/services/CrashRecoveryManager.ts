import fs from 'node:fs/promises';
import path from 'node:path';

interface CrashState {
  lastStartAt: string;
  lastShutdownAt?: string;
  cleanShutdown: boolean;
}

export class CrashRecoveryManager {
  private readonly crashStatePath: string;
  private readonly crashLogPath: string;

  constructor(userDataDir: string) {
    this.crashStatePath = path.join(userDataDir, 'crash-state.json');
    this.crashLogPath = path.join(userDataDir, 'crash-events.log');
  }

  async initialize(): Promise<{ previousRunCrashed: boolean }> {
    const previousState = await this.readState();
    const previousRunCrashed = previousState ? !previousState.cleanShutdown : false;

    await this.persistState({
      lastStartAt: new Date().toISOString(),
      cleanShutdown: false
    });

    this.installProcessHandlers();
    return { previousRunCrashed };
  }

  async markCleanShutdown(): Promise<void> {
    const current = await this.readState();
    await this.persistState({
      lastStartAt: current?.lastStartAt ?? new Date().toISOString(),
      lastShutdownAt: new Date().toISOString(),
      cleanShutdown: true
    });
  }

  private installProcessHandlers(): void {
    process.on('uncaughtException', (error) => {
      void this.appendCrashEvent('uncaughtException', error);
    });

    process.on('unhandledRejection', (reason) => {
      void this.appendCrashEvent('unhandledRejection', reason);
    });
  }

  private async readState(): Promise<CrashState | null> {
    try {
      const raw = await fs.readFile(this.crashStatePath, 'utf8');
      return JSON.parse(raw) as CrashState;
    } catch {
      return null;
    }
  }

  private async persistState(state: CrashState): Promise<void> {
    const tempPath = `${this.crashStatePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempPath, this.crashStatePath);
  }

  private async appendCrashEvent(type: string, payload: unknown): Promise<void> {
    const body = payload instanceof Error ? `${payload.stack ?? payload.message}` : JSON.stringify(payload);
    const line = `[${new Date().toISOString()}] ${type}: ${body}\n`;
    await fs.appendFile(this.crashLogPath, line, 'utf8');
  }
}
