import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pty from 'node-pty';

export type AgentRoleName = 'coordinator' | 'builder' | 'scout' | 'reviewer';
export type CliProvider = 'claude' | 'codex' | 'gemini';

export interface AgentProcessConfig {
  agentId: string;
  role: AgentRoleName;
  cliProvider: CliProvider;
  workspaceDir: string;
  initialContext: string;
  startupDelay: number;
}

export type AgentProcessStatus = Readonly<{
  agentId: string;
  role: AgentRoleName;
  isReady: boolean;
  uptime: number;
  lastActivity: number;
}>;

type AgentProcessEvents = {
  output: { agentId: string; data: string; timestamp: number };
  'exec-complete': { agentId: string; seq: number; data: string; timestamp: number };
  ready: { agentId: string; timestamp: number };
  exit: { agentId: string; exitCode: number; signal?: number; timestamp: number };
  error: { agentId: string; error: string; timestamp: number };
};

/**
 * Represents a single agent's isolated PTY session.
 *
 * The agent is a CLI-driven interactive process (Claude/Codex/Gemini) that receives
 * prompt context via stdin and emits output that can be parsed into structured messages.
 */
export class AgentProcess {
  private readonly agentId: string;
  private readonly role: AgentRoleName;
  private readonly cliProvider: CliProvider;
  private readonly workspaceDir: string;
  private readonly initialContext: string;
  private readonly startupDelay: number;

  private proc: pty.IPty | null = null;
  private codexProcess: ChildProcessWithoutNullStreams | null = null;
  private outputBuffer = '';
  private isReady = false;
  private readonly startTime = Date.now();
  private lastActivityTime = Date.now();
  /**
   * Queue of logical messages (prompts) waiting to be sent to the agent.
   * These are raw prompt strings (no automatic newline suffixing).
   */
  private readonly messageQueue: string[] = [];

  // Codex exec-runner state (used to preserve ordering and avoid overlapping runs).
  private execBusy = false;
  private execSeq = 0;
  private execSentinel: string | null = null;
  private execCaptureSeq: number | null = null;
  private execCapture = '';
  private execResultBegin: string | null = null;
  private execResultEnd: string | null = null;
  private readonly emitter = new EventEmitter();

  constructor(config: AgentProcessConfig) {
    this.agentId = config.agentId;
    this.role = config.role;
    this.cliProvider = config.cliProvider;
    this.workspaceDir = config.workspaceDir;
    this.initialContext = config.initialContext;
    this.startupDelay = config.startupDelay;
    this.emitter.setMaxListeners(50);
  }

  public getAgentId(): string {
    return this.agentId;
  }

  public getRole(): AgentRoleName {
    return this.role;
  }

  public getCliProvider(): CliProvider {
    return this.cliProvider;
  }

  public on<EventName extends keyof AgentProcessEvents>(
    event: EventName,
    listener: (payload: AgentProcessEvents[EventName]) => void
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  /**
   * Start the underlying PTY process and inject initial context after startup delay.
   *
   * Retries up to 3 times if spawn fails.
   */
  public async startProcess(): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.startOnce();
        return;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${this.ts()}] [AGENT:START] ${this.agentId} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}`);
        await sleep(350 * attempt);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to start agent process "${this.agentId}" after ${MAX_ATTEMPTS} attempts: ${message}`);
  }

  /**
   * Inject context/prompt text into the agent process.
   *
   * Uses Windows-friendly line endings and ensures a trailing newline.
   */
  public async injectContext(context: string): Promise<void> {
    if (this.cliProvider === 'codex') {
      const normalized = normalizeLineEndings(context);
      const payload = normalized.endsWith(osNewline()) ? normalized : `${normalized}${osNewline()}`;
      console.log(`[${this.ts()}] [AGENT:CONTEXT] ${this.agentId} ${payload.length} bytes`);
      return;
    }
    const proc = this.proc;
    if (!proc) {
      throw new Error(`Agent ${this.agentId} PTY is not running.`);
    }
    const normalized = normalizeLineEndings(context);
    const payload = normalized.endsWith(osNewline()) ? normalized : `${normalized}${osNewline()}`;
    proc.write(payload);
    console.log(`[${this.ts()}] [AGENT:CONTEXT] ${this.agentId} ${payload.length} bytes`);
  }

  /**
   * Send a message to the agent.
   *
   * If the agent is not ready yet, queues the message until readiness.
   */
  public sendMessage(message: string): void {
    const normalized = normalizeLineEndings(message).replace(/(\r?\n)+$/g, '');
    if (!this.isReady || (this.cliProvider !== 'codex' && !this.proc) || (this.cliProvider === 'codex' && this.execBusy)) {
      this.messageQueue.push(normalized);
      return;
    }

    if (this.cliProvider === 'codex') {
      this.runCodexExecProcess(normalized);
      return;
    }

    const payload = normalized.endsWith(osNewline()) ? normalized : `${normalized}${osNewline()}`;
    this.proc.write(payload);
    console.log(`[${this.ts()}] [AGENT:SEND] ${this.agentId} ${payload.length} bytes`);
  }

  /**
   * Register an output capture callback.
   *
   * The callback receives sanitized, filtered output lines (not raw control sequences).
   */
  public captureOutput(onOutput: (data: string) => void): void {
    this.on('output', (payload) => onOutput(payload.data));
  }

  /**
   * Report agent process status.
   */
  public getStatus(): AgentProcessStatus {
    const now = Date.now();
    return {
      agentId: this.agentId,
      role: this.role,
      isReady: this.isReady,
      uptime: now - this.startTime,
      lastActivity: now - this.lastActivityTime
    };
  }

  /**
   * Terminate the agent PTY process and cleanup resources.
   */
  public async terminate(): Promise<void> {
    const proc = this.proc;
    this.isReady = false;
    this.proc = null;
    const codexProcess = this.codexProcess;
    this.codexProcess = null;
    this.outputBuffer = '';
    this.messageQueue.length = 0;
    this.execBusy = false;
    this.execSentinel = null;
    this.execResultBegin = null;
    this.execResultEnd = null;

    if (proc) {
      try {
        proc.kill();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${this.ts()}] [AGENT:STOP] ${this.agentId} kill failed: ${message}`);
      }
    }
    if (codexProcess) {
      try {
        codexProcess.kill();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${this.ts()}] [AGENT:STOP] ${this.agentId} codex kill failed: ${message}`);
      }
    }
    console.log(`[${this.ts()}] [AGENT:STOP] ${this.agentId} terminated`);
  }

  private async startOnce(): Promise<void> {
    if (this.proc) {
      throw new Error(`Agent ${this.agentId} process is already running.`);
    }

    const env = buildSpawnEnv(this.cliProvider, this.workspaceDir);

    if (this.cliProvider === 'codex') {
      const resolved = resolveCommandOnPath(providerSpec('codex').commandNames);
      if (!resolved) {
        throw new Error('Cannot start provider "codex": command "codex" not found on PATH.');
      }
      await sleep(Math.max(0, this.startupDelay));
      await this.injectContext(this.initialContext);
      this.isReady = true;
      this.flushQueuedMessages();
      this.emitter.emit('ready', { agentId: this.agentId, timestamp: Date.now() } satisfies AgentProcessEvents['ready']);
      console.log(`[${this.ts()}] [AGENT:READY] ${this.agentId} is ready`);
      return;
    }

    // Codex interactive TUI is hard to drive in PTY (multi-line pastes often aren't "submitted",
    // and MCP startup noise can overwhelm parsers). For reliability, run Codex via `codex exec`
    // inside a shell PTY and feed prompts through stdin.
    const proc = (() => {
      const cmd = buildCliCommand(this.cliProvider);
      console.log(
        `[${this.ts()}] [AGENT:START] ${this.agentId} starting provider=${this.cliProvider} role=${this.role} (${cmd.displayName})`
      );
      return pty.spawn(cmd.file, cmd.args, {
        name: 'xterm-256color',
        cwd: this.workspaceDir,
        cols: 120,
        rows: 30,
        env
      });
    })();
    this.proc = proc;

    proc.onData((data) => this.handleRawOutput(data));
    proc.onExit((e) => {
      const now = Date.now();
      this.isReady = false;
      this.proc = null;
      this.emitter.emit('exit', { agentId: this.agentId, exitCode: e.exitCode, signal: e.signal, timestamp: now } satisfies AgentProcessEvents['exit']);
    });

    // Wait for the CLI to initialize, then inject the initial context.
    await sleep(Math.max(0, this.startupDelay));
    if (!this.proc) {
      throw new Error(`Agent ${this.agentId} exited during startup.`);
    }
    this.configureWindowsShellEncoding();
    await this.injectContext(this.initialContext);
    if (!this.proc) {
      throw new Error(`Agent ${this.agentId} exited during context injection.`);
    }

    this.isReady = true;
    this.flushQueuedMessages();
    this.emitter.emit('ready', { agentId: this.agentId, timestamp: Date.now() } satisfies AgentProcessEvents['ready']);
    console.log(`[${this.ts()}] [AGENT:READY] ${this.agentId} is ready`);
  }

  private flushQueuedMessages(): void {
    if (!this.proc) return;
    if (this.cliProvider === 'codex' && this.execBusy) return;

    while (this.messageQueue.length > 0) {
      const next = this.messageQueue.shift();
      if (typeof next !== 'string' || !next) {
        continue;
      }
      this.sendMessage(next);
      // For codex exec mode, sendMessage will set execBusy and we should stop flushing.
      if (this.cliProvider === 'codex' && this.execBusy) {
        return;
      }
    }
  }

  private handleRawOutput(data: string): void {
    const now = Date.now();
    this.lastActivityTime = now;

    const sanitized = this.sanitizeOutput(data);
    if (!sanitized) {
      return;
    }

    // Accumulate partial lines to ensure downstream parsers see complete lines.
    this.outputBuffer += sanitized;
    if (this.outputBuffer.length > 2_000_000) {
      this.outputBuffer = this.outputBuffer.slice(-2_000_000);
    }

    if (this.execBusy && this.execResultBegin && this.execResultEnd) {
      const resultChunk = extractDelimitedChunk(this.outputBuffer, this.execResultBegin, this.execResultEnd);
      if (resultChunk) {
        this.outputBuffer = resultChunk.remainder;
        this.captureAndEmit(resultChunk.lines, now);
      } else {
        const beginIdx = this.outputBuffer.indexOf(this.execResultBegin);
        if (beginIdx >= 0) {
          this.outputBuffer = this.outputBuffer.slice(beginIdx);
        } else if (this.outputBuffer.length > 16_000) {
          this.outputBuffer = this.outputBuffer.slice(-16_000);
        }
      }
    }

    const execChunk = this.execSentinel ? extractExecChunk(this.outputBuffer, this.execSentinel) : null;
    if (execChunk) {
      this.outputBuffer = execChunk.remainder;
      this.emitExecComplete(now);
      this.onCodexExecDone();
      return;
    }

    const { completeLines, remainder } = splitCompleteLines(this.outputBuffer);
    this.outputBuffer = remainder;

    this.captureAndEmit(completeLines, now);
  }

  private emitExecComplete(now: number): void {
    if (this.cliProvider !== 'codex') return;
    const seq = this.execCaptureSeq;
    if (seq === null) return;
    const data = this.execCapture.trim();
    this.execCaptureSeq = null;
    this.execCapture = '';
    this.emitter.emit('exec-complete', { agentId: this.agentId, seq, data, timestamp: now } satisfies AgentProcessEvents['exec-complete']);
  }

  private shouldCaptureOutput(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isLikelyBinaryTerminalPayload(trimmed)) return false;
    if (isCodexExecNoiseLine(trimmed)) return false;
    if (/\[swarm relay\]/i.test(trimmed)) return false;
    if (/^\[SWARM_RESULT_(BEGIN|END):/i.test(trimmed)) return false;
    // PowerShell echo / continuation prompts (codex exec runner).
    if (trimmed.startsWith('>>')) return false;
    if (trimmed.includes('$swarm_b64=') || trimmed.includes('$swarm_prompt=')) return false;
    // Base64-like fragments from long PowerShell command echoes (legacy/continuations).
    // These are not meaningful agent output and can swamp the parser.
    if (this.execBusy && /^[A-Za-z0-9+/=]{8,}$/.test(trimmed)) return false;
    // Filter obvious command echo fragments while codex exec is running.
    if (this.execBusy && /\b(Get-Content|Remove-Item|FromBase64String|Write-Output)\b/i.test(trimmed)) return false;
    if (this.execBusy && /\bcodex\b/i.test(trimmed) && /\bexec\b/i.test(trimmed)) return false;
    if (/^\[[\d;?]+[mKHJ]/.test(trimmed)) return false;
    if (/^(\.\.\.|>>>|PS\s|PS>|%|>\s*$)/i.test(trimmed)) return false;
    return true;
  }

  private sanitizeOutput(data: string): string {
    if (isLikelyBinaryTerminalPayload(data)) {
      return '';
    }

    // Strip ANSI escape codes.
    let out = data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    out = out.replace(/\x1b\][^\u0007]*\u0007/g, '');

    // Remove non-printing control characters except tab/newline.
    out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    // Normalize to '\n' for internal processing.
    out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Drop obvious spinner/progress fragments.
    out = out.replace(/[⠁-⠿]/g, '');

    return out;
  }

  private configureWindowsShellEncoding(): void {
    if (process.platform !== 'win32') {
      return;
    }
    if (!this.proc) {
      return;
    }

    const utf8Command =
      `[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false);` +
      `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);` +
      `$OutputEncoding=[System.Text.UTF8Encoding]::new($false);` +
      `chcp 65001 > $null`;

    this.proc.write(`${utf8Command}${osNewline()}`);
  }

  private onCodexExecDone(): void {
    if (this.cliProvider !== 'codex') return;
    if (!this.execBusy) return;
    this.execBusy = false;
    this.execSentinel = null;
    this.execResultBegin = null;
    this.execResultEnd = null;
    this.flushQueuedMessages();
  }

  private runCodexExecProcess(prompt: string): void {
    const seq = (this.execSeq += 1);
    this.execBusy = true;
    this.execCaptureSeq = seq;
    this.execCapture = '';
    this.execSentinel = null;
    this.execResultBegin = null;
    this.execResultEnd = null;

    const env = buildSpawnEnv(this.cliProvider, this.workspaceDir);
    const resolved = resolveCommandOnPath(providerSpec('codex').commandNames);
    if (!resolved) {
      this.execBusy = false;
      throw new Error('Cannot start provider "codex": command "codex" not found on PATH.');
    }

    const outputFile = createSwarmTempOutputFile(this.agentId, seq);
    const codexArgs = ['exec', '--color', 'never', '--skip-git-repo-check', '-C', this.workspaceDir, '--output-last-message', outputFile, '-'];

    const disableMcpOverrides = buildDisableAllMcpServersOverrides();
    for (const override of disableMcpOverrides) {
      codexArgs.push('-c', override);
    }

    const child = spawn(resolved, codexArgs, {
      cwd: this.workspaceDir,
      env,
      stdio: 'pipe',
      shell: process.platform === 'win32'
    });
    this.codexProcess = child;

    let combinedOutput = '';
    const appendCombined = (chunk: string) => {
      combinedOutput = `${combinedOutput}${combinedOutput ? '\n' : ''}${chunk}`;
      if (combinedOutput.length > 2_000_000) {
        combinedOutput = combinedOutput.slice(-2_000_000);
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = this.sanitizeOutput(chunk.toString());
      if (text.trim()) {
        appendCombined(text);
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = this.sanitizeOutput(chunk.toString());
      if (text.trim()) {
        appendCombined(text);
      }
    });
    child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      appendCombined(`[SWARM_CMD_ERROR] ${message}`);
    });
    child.on('close', () => {
      const now = Date.now();
      this.codexProcess = null;

      let finalText = '';
      try {
        if (fs.existsSync(outputFile)) {
          finalText = fs.readFileSync(outputFile, 'utf8').trim();
        }
      } finally {
        try {
          fs.unlinkSync(outputFile);
        } catch {
          // ignore cleanup failures
        }
      }

      if (!finalText) {
        finalText = combinedOutput.trim();
      }
      if (finalText) {
        this.captureAndEmit(finalText.split('\n'), now);
      }
      this.emitExecComplete(now);
      this.onCodexExecDone();
    });

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();
    console.log(`[${this.ts()}] [AGENT:SEND] ${this.agentId} codex-exec bytes=${prompt.length} seq=${seq}`);
  }

  private captureAndEmit(lines: readonly string[], now: number): void {
    const captured = lines
      .map((line) => line.trimEnd())
      .filter((line) => this.shouldCaptureOutput(line))
      .join('\n');

    if (!captured) {
      return;
    }

    if (this.execBusy && this.execCaptureSeq !== null) {
      this.execCapture = `${this.execCapture}${this.execCapture ? '\n' : ''}${captured}`;
      if (this.execCapture.length > 2_000_000) {
        this.execCapture = this.execCapture.slice(-2_000_000);
      }
    }

    this.emitter.emit('output', { agentId: this.agentId, data: captured, timestamp: now } satisfies AgentProcessEvents['output']);
  }

  private ts(): string {
    return new Date().toISOString();
  }
}

type CliCommand = Readonly<{ file: string; args: string[]; displayName: string }>;

function buildCliCommand(provider: CliProvider): CliCommand {
  const spec = providerSpec(provider);
  const resolved = resolveCommandOnPath(spec.commandNames);
  if (!resolved) {
    const label = spec.commandNames[0] ?? provider;
    throw new Error(
      `Cannot start provider "${provider}": command "${label}" not found on PATH. ` +
        `Install the "${label}" CLI (or choose a different provider) and restart the app.`
    );
  }

  if (process.platform === 'win32') {
    const ps = buildPowerShellInvocation(resolved, spec.args);
    return {
      file: ps.file,
      args: ps.args,
      displayName: `${path.basename(resolved)} ${spec.args.join(' ')}`.trim()
    };
  }

  return {
    file: resolved,
    args: spec.args,
    displayName: `${path.basename(resolved)} ${spec.args.join(' ')}`.trim()
  };
}

function providerSpec(provider: CliProvider): { commandNames: string[]; args: string[] } {
  const isWin = process.platform === 'win32';
  if (provider === 'claude') {
    return {
      commandNames: isWin ? ['claude.exe', 'claude.cmd', 'claude.bat', 'claude'] : ['claude', 'claude.exe'],
      args: ['--terminal', '--no-history']
    };
  }
  if (provider === 'codex') {
    return {
      commandNames: isWin ? ['codex.exe', 'codex.cmd', 'codex.bat', 'codex'] : ['codex', 'codex'],
      // Codex runs interactively by default when no subcommand is specified.
      // Disable alt screen to keep output in normal terminal scrollback (helps PTY capture/parsing).
      args: ['--no-alt-screen']
    };
  }
  return {
    commandNames: isWin ? ['gemini.exe', 'gemini.cmd', 'gemini.bat', 'gemini'] : ['gemini', 'gemini'],
    args: ['shell']
  };
}

function resolveCommandOnPath(commandNames: readonly string[]): string | null {
  const pathValue = process.env.PATH ?? '';
  const pathParts = pathValue.split(path.delimiter).filter(Boolean);
  const candidates = commandNames.length > 0 ? commandNames : [];

  for (const name of candidates) {
    if (path.isAbsolute(name) && fs.existsSync(name)) {
      return name;
    }
  }

  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT?.split(';').map((e) => e.toLowerCase()).filter(Boolean) ?? ['.exe', '.cmd', '.bat'])
    : [''];

  const normalize = (value: string) => value.replace(/^\"+|\"+$/g, '');

  for (const rawDir of pathParts) {
    const dir = normalize(rawDir);
    for (const rawName of candidates) {
      const name = normalize(rawName);
      if (!name) continue;
      const hasExt = Boolean(path.extname(name));

      // If the name already has an extension, try it directly.
      if (hasExt) {
        const direct = path.join(dir, name);
        if (fs.existsSync(direct)) {
          return direct;
        }
        continue;
      }

      // On Windows, prefer PATHEXT executables over extension-less shims.
      for (const ext of exts) {
        if (!ext) continue;
        const withExt = path.join(dir, `${name}${ext}`);
        if (fs.existsSync(withExt)) {
          return withExt;
        }
      }

      // Fallback: extension-less (non-Windows, or uncommon Windows setups).
      const direct = path.join(dir, name);
      if (fs.existsSync(direct)) {
        return direct;
      }
    }
  }

  return null;
}

function buildPowerShellInvocation(executablePath: string, args: readonly string[]): { file: string; args: string[] } {
  const exe = psQuote(executablePath);
  const renderedArgs = args.map((a) => psQuote(a)).join(' ');
  const bootstrap =
    `[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); ` +
    `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ` +
    `$OutputEncoding=[System.Text.UTF8Encoding]::new($false); ` +
    `chcp 65001 > $null;`;
  const command = renderedArgs ? `${bootstrap} & ${exe} ${renderedArgs}` : `${bootstrap} & ${exe}`;

  return {
    file: resolveWindowsPowerShellPath(),
    args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]
  };
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildDisableAllMcpServersOverrides(): string[] {
  const discovered = discoverCodexMcpServerNames();
  const fallback: string[] = [
    'context7',
    'sequential-thinking',
    'filesystem',
    'github',
    'google-search',
    'playwright',
    'discord',
    'figma',
    'openaiDeveloperDocs',
    'stitch',
    'supabase'
  ];

  const names = new Set<string>();
  for (const name of discovered.length > 0 ? discovered : fallback) {
    const normalized = name.trim();
    if (!normalized) continue;
    names.add(normalized);
  }

  return Array.from(names)
    .sort()
    .map((name) => `mcp_servers.${name}.enabled=false`);
}

function discoverCodexMcpServerNames(): string[] {
  try {
    const configPath = codexConfigTomlPath();
    if (!configPath) return [];
    if (!fs.existsSync(configPath)) return [];

    // Never log config content: it may contain secrets (tokens, API keys).
    const raw = fs.readFileSync(configPath, 'utf8');
    const names = new Set<string>();

    for (const line of raw.split(/\r?\n/g)) {
      const trimmed = line.trim();
      // Example: [mcp_servers.discord]
      const match = trimmed.match(/^\[mcp_servers\.([^\]]+)\]\s*$/);
      if (!match) continue;
      const rawName = match[1] ?? '';
      const name = rawName.replace(/^['"]|['"]$/g, '').trim();
      if (!name) continue;
      // TOML may include nested tables like [mcp_servers.discord.env]; keep only top-level server name.
      const top = name.split('.')[0]?.trim() ?? '';
      if (!top) continue;
      names.add(top);
    }

    return Array.from(names);
  } catch {
    return [];
  }
}

function codexConfigTomlPath(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return null;
  return path.join(home, '.codex', 'config.toml');
}

function createSwarmTempPromptFile(agentId: string, seq: number, prompt: string): string {
  const dir = path.join(os.tmpdir(), 'quanswarm-prompts');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore; mkdirSync throws if permissions are restricted
  }
  const safeAgent = agentId.replace(/[^A-Za-z0-9_-]/g, '_');
  const name = `prompt-${safeAgent}-${seq}-${Date.now()}.txt`;
  const filePath = path.join(dir, name);
  // Keep file content stable and avoid accidental terminal control sequences.
  const content = normalizeLineEndings(prompt);
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  return filePath;
}

function createSwarmTempOutputFile(agentId: string, seq: number): string {
  const dir = path.join(os.tmpdir(), 'quanswarm-prompts');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore; mkdirSync throws if permissions are restricted
  }
  const safeAgent = agentId.replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(dir, `output-${safeAgent}-${seq}-${Date.now()}.txt`);
}

function resolveWindowsPowerShellPath(): string {
  if (process.platform !== 'win32') {
    return 'powershell';
  }
  const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const candidate = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(candidate) ? candidate : 'powershell.exe';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSpawnEnv(provider: CliProvider, workspaceDir: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  // Codex CLI sometimes uses ~/.codex on Windows; that location may be blocked by policy.
  // Prefer a writable per-app location if CODEX_HOME isn't explicitly set.
  if (provider === 'codex' && !env.CODEX_HOME && process.platform === 'win32') {
    const base = env.LOCALAPPDATA || env.APPDATA || path.join(os.homedir(), 'AppData', 'Local');
    env.CODEX_HOME = path.join(base, 'Vibe-ADE', 'codex');
  }

  // Ensure TEMP/TMP are set (some CLI tooling relies on them).
  if (!env.TEMP || !env.TMP) {
    const tmp = os.tmpdir();
    env.TEMP = env.TEMP || tmp;
    env.TMP = env.TMP || tmp;
  }

  // Provide a stable working directory hint (best-effort).
  env.PWD = workspaceDir;
  env.LANG = env.LANG || 'en_US.UTF-8';
  env.LC_ALL = env.LC_ALL || 'en_US.UTF-8';
  env.PYTHONIOENCODING = env.PYTHONIOENCODING || 'utf-8';
  env.NO_COLOR = env.NO_COLOR || '1';

  return env;
}

export function isLikelyBinaryTerminalPayload(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (!sample.trim()) {
    return false;
  }

  if (/word\/_rels\/|\\word\\_rels\\|\[Content_Types\]\.xml|docProps\/|PK[\s\S]{0,80}(word\/|docProps\/|\[Content_Types\]\.xml)/i.test(sample)) {
    return true;
  }

  const replacementChars = (sample.match(/\uFFFD/g) ?? []).length;
  if (replacementChars >= 8) {
    return true;
  }

  const controlChars = (sample.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) ?? []).length;
  return controlChars >= 6;
}

export function isCodexExecNoiseLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/^OpenAI Codex v/i.test(trimmed)) return true;
  if (/^tokens used$/i.test(trimmed)) return true;
  if (/^\d{1,3}(,\d{3})*$/.test(trimmed)) return true;
  if (/^codex$/i.test(trimmed)) return true;
  return false;
}

export function extractExecChunk(buffer: string, sentinel: string): { lines: string[]; remainder: string } | null {
  const idx = buffer.indexOf(sentinel);
  if (idx < 0) {
    return null;
  }

  const before = buffer.slice(0, idx);
  const after = buffer.slice(idx + sentinel.length).replace(/^\r?\n/, '');
  const { completeLines, remainder } = splitCompleteLines(before);
  const lines = [...completeLines];
  if (remainder.trim()) {
    lines.push(remainder);
  }
  return { lines, remainder: after };
}

export function extractDelimitedChunk(buffer: string, begin: string, end: string): { lines: string[]; remainder: string } | null {
  const beginIdx = buffer.indexOf(begin);
  if (beginIdx < 0) {
    return null;
  }

  const start = beginIdx + begin.length;
  const endIdx = buffer.indexOf(end, start);
  if (endIdx < 0) {
    return null;
  }

  const content = buffer.slice(start, endIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  const after = buffer.slice(endIdx + end.length).replace(/^\r?\n/, '');
  const { completeLines, remainder } = splitCompleteLines(content);
  const lines = [...completeLines];
  if (remainder.trim()) {
    lines.push(remainder);
  }
  return { lines, remainder: after };
}

function osNewline(): string {
  return process.platform === 'win32' ? '\r\n' : '\n';
}

function normalizeLineEndings(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return process.platform === 'win32' ? normalized.replace(/\n/g, '\r\n') : normalized;
}

function splitCompleteLines(text: string): { completeLines: string[]; remainder: string } {
  const lines = text.split('\n');
  if (text.endsWith('\n')) {
    return { completeLines: lines.filter((l) => l.length > 0), remainder: '' };
  }
  const remainder = lines.pop() ?? '';
  return { completeLines: lines, remainder };
}
