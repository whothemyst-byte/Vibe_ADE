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
    if (!this.isReady || !this.proc || (this.cliProvider === 'codex' && this.execBusy)) {
      this.messageQueue.push(normalized);
      return;
    }

    if (this.cliProvider === 'codex') {
      this.sendCodexExec(normalized);
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
    this.outputBuffer = '';
    this.messageQueue.length = 0;
    this.execBusy = false;
    this.execSentinel = null;

    if (proc) {
      try {
        proc.kill();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${this.ts()}] [AGENT:STOP] ${this.agentId} kill failed: ${message}`);
      }
    }
    console.log(`[${this.ts()}] [AGENT:STOP] ${this.agentId} terminated`);
  }

  private async startOnce(): Promise<void> {
    if (this.proc) {
      throw new Error(`Agent ${this.agentId} process is already running.`);
    }

    const env = buildSpawnEnv(this.cliProvider, this.workspaceDir);

    // Codex interactive TUI is hard to drive in PTY (multi-line pastes often aren't "submitted",
    // and MCP startup noise can overwhelm parsers). For reliability, run Codex via `codex exec`
    // inside a shell PTY and feed prompts through stdin.
    const proc =
      this.cliProvider === 'codex'
        ? this.spawnShellForCodex(env)
        : (() => {
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

    const { completeLines, remainder } = splitCompleteLines(this.outputBuffer);
    this.outputBuffer = remainder;

    let execCompleted = false;
    const captured = completeLines
      .map((line) => line.trimEnd())
      .filter((line) => {
        if (this.execSentinel && line.trim() === this.execSentinel) {
          execCompleted = true;
          return false;
        }
        return this.shouldCaptureOutput(line);
      })
      .join('\n');

    if (!captured) {
      if (execCompleted) {
        this.emitExecComplete(now);
        this.onCodexExecDone();
      }
      return;
    }

    if (this.execBusy && this.execCaptureSeq !== null) {
      this.execCapture = `${this.execCapture}${this.execCapture ? '\n' : ''}${captured}`;
      if (this.execCapture.length > 2_000_000) {
        this.execCapture = this.execCapture.slice(-2_000_000);
      }
    }

    this.emitter.emit('output', { agentId: this.agentId, data: captured, timestamp: now } satisfies AgentProcessEvents['output']);

    if (execCompleted) {
      this.emitExecComplete(now);
      this.onCodexExecDone();
    }
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
    if (/\[swarm relay\]/i.test(trimmed)) return false;
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

  private spawnShellForCodex(env: Record<string, string>): pty.IPty {
    const ps = resolveWindowsPowerShellPath();
    const args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass'];
    console.log(`[${this.ts()}] [AGENT:START] ${this.agentId} starting provider=codex role=${this.role} (PowerShell exec runner)`);
    return pty.spawn(ps, args, {
      name: 'xterm-256color',
      cwd: this.workspaceDir,
      cols: 120,
      rows: 30,
      env
    });
  }

  private onCodexExecDone(): void {
    if (this.cliProvider !== 'codex') return;
    if (!this.execBusy) return;
    this.execBusy = false;
    this.execSentinel = null;
    this.flushQueuedMessages();
  }

  private sendCodexExec(prompt: string): void {
    const proc = this.proc;
    if (!proc) {
      throw new Error(`Agent ${this.agentId} PTY is not running.`);
    }

    const seq = (this.execSeq += 1);
    const sentinel = `[SWARM_CMD_DONE:${this.agentId}:${seq}]`;
    this.execBusy = true;
    this.execSentinel = sentinel;
    this.execCaptureSeq = seq;
    this.execCapture = '';

    const psSentinel = psQuote(sentinel);

    // Reduce startup noise/failures by disabling all configured MCP servers for agent runs,
    // and force non-colored output for easier parsing.
    const codexArgs = ['exec', '--color', 'never', '--skip-git-repo-check', '-C', this.workspaceDir, '-'];

    const disableMcpOverrides = buildDisableAllMcpServersOverrides();
    for (const override of disableMcpOverrides) {
      codexArgs.push('-c', override);
    }

    const renderedCodexArgs = codexArgs.map((a) => psQuote(a)).join(' ');

    const tmpFile = createSwarmTempPromptFile(this.agentId, seq, prompt);
    const psTmpFile = psQuote(tmpFile);

    const command =
      `$ErrorActionPreference='Stop';` +
      `try { Get-Content -Raw -Encoding UTF8 -LiteralPath ${psTmpFile} | codex ${renderedCodexArgs} } ` +
      `catch { Write-Output ('[SWARM_CMD_ERROR] ' + $_.Exception.Message) } ` +
      `finally { Remove-Item -LiteralPath ${psTmpFile} -ErrorAction SilentlyContinue; Write-Output ${psSentinel} }`;

    proc.write(`${command}${osNewline()}`);
    console.log(`[${this.ts()}] [AGENT:SEND] ${this.agentId} codex-exec bytes=${prompt.length} seq=${seq}`);
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
  const command = renderedArgs ? `& ${exe} ${renderedArgs}` : `& ${exe}`;

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

  return env;
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
