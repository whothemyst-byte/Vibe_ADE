import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ShellType, WorkspaceTemplate } from '@shared/types';

interface ProgressEvent {
  workspaceId: string;
  command: string;
  output: string;
  done: boolean;
  success: boolean;
}

function getArgs(shell: ShellType, command: string): { file: string; args: string[] } {
  if (shell === 'cmd') {
    return { file: 'cmd.exe', args: ['/D', '/S', '/C', command] };
  }
  return { file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] };
}

export class TemplateRunner {
  private readonly emitter = new EventEmitter();

  onProgress(listener: (event: ProgressEvent) => void): () => void {
    this.emitter.on('progress', listener);
    return () => this.emitter.off('progress', listener);
  }

  async run(input: { workspaceId: string; cwd: string; template: WorkspaceTemplate }): Promise<void> {
    for (const command of input.template.commands) {
      const result = await this.runCommand(input.cwd, input.template.shell, command);
      this.emitter.emit('progress', {
        workspaceId: input.workspaceId,
        command,
        output: result.output,
        done: true,
        success: result.exitCode === 0
      } satisfies ProgressEvent);

      if (result.exitCode !== 0) {
        break;
      }
    }
  }

  private runCommand(cwd: string, shell: ShellType, command: string): Promise<{ output: string; exitCode: number }> {
    const args = getArgs(shell, command);
    return new Promise((resolve, reject) => {
      const proc = spawn(args.file, args.args, {
        cwd,
        env: process.env,
        windowsHide: true
      });

      let output = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolve({ output, exitCode: code ?? -1 });
      });
    });
  }
}