import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { AgentCommandSuggestion, AgentStructuredOutput, AgentStep, PaneId } from '@shared/types';

interface AgentRun {
  paneId: PaneId;
  process: ReturnType<typeof spawn>;
}

function parseSection(raw: string, heading: string): string {
  const regex = new RegExp(`##\\s*${heading}([\\s\\S]*?)(?=\\n##\\s*|$)`, 'i');
  const match = raw.match(regex);
  return match?.[1]?.trim() ?? '';
}

function parseSteps(text: string): AgentStep[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*\d]/.test(line))
    .map((line) => {
      const cleaned = line.replace(/^[-*\d.\s]+/, '').trim();
      const separatorIndex = cleaned.indexOf(':');
      if (separatorIndex > 0) {
        return {
          title: cleaned.slice(0, separatorIndex).trim(),
          details: cleaned.slice(separatorIndex + 1).trim()
        };
      }
      return {
        title: cleaned,
        details: ''
      };
    });
}

function detectDestructive(command: string): boolean {
  const riskyPatterns = [/\brm\b/i, /\bdel\b/i, /\bformat\b/i, /\bRemove-Item\b/i, /\bgit reset --hard\b/i];
  return riskyPatterns.some((pattern) => pattern.test(command));
}

function parseCommands(text: string): AgentCommandSuggestion[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('*'))
    .map((line) => line.replace(/^[-*]\s*/, ''))
    .map((line) => {
      const [command, ...rest] = line.split(' // ');
      return {
        command: command.trim(),
        rationale: rest.join(' // ').trim() || 'No rationale provided.',
        destructive: detectDestructive(command)
      };
    });
}

function parseAgentOutput(raw: string): AgentStructuredOutput {
  const plan = parseSection(raw, 'Plan') || raw;
  const stepsRaw = parseSection(raw, 'Steps');
  const commandsRaw = parseSection(raw, 'Commands');
  const explanation = parseSection(raw, 'Explanation');

  return {
    raw,
    plan,
    steps: parseSteps(stepsRaw),
    commands: parseCommands(commandsRaw),
    explanation
  };
}

export class AgentManager {
  private readonly runs = new Map<PaneId, AgentRun>();
  private readonly emitter = new EventEmitter();

  onUpdate(listener: (paneId: PaneId, output: AgentStructuredOutput) => void): () => void {
    this.emitter.on('update', listener);
    return () => this.emitter.off('update', listener);
  }

  start(input: { paneId: PaneId; model: string; prompt: string; cwd: string }): void {
    this.stop(input.paneId);

    // Sanitize prompt to prevent injection attacks
    const sanitizedPrompt = input.prompt
      .trim()
      .slice(0, 10000) // Limit length
      .replace(/[<>]/g, ''); // Remove HTML-like chars

    // Validate model name (only alphanumeric, dots, hyphens, underscores)
    if (!/^[a-zA-Z0-9._-]+$/.test(input.model)) {
      console.warn(`Invalid model name: ${input.model}`);
      return;
    }

    const fullPrompt = [
      'You are an agent planner. Output markdown sections exactly:',
      '## Plan',
      '## Steps',
      '## Commands',
      '## Explanation',
      'Never execute commands. Suggest only.',
      '',
      sanitizedPrompt
    ].join('\n');

    const proc = spawn('ollama', ['run', input.model], {
      cwd: input.cwd,
      env: process.env,
      windowsHide: true
    });

    let buffer = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
    });

    proc.on('close', () => {
      const output = parseAgentOutput(buffer);
      this.emitter.emit('update', input.paneId, output);
      this.runs.delete(input.paneId);
    });

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    this.runs.set(input.paneId, {
      paneId: input.paneId,
      process: proc
    });
  }

  stop(paneId: PaneId): void {
    const run = this.runs.get(paneId);
    if (!run) {
      return;
    }
    run.process.kill();
    this.runs.delete(paneId);
  }
}