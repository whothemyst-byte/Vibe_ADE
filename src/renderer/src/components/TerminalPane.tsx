import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, type ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import type { PaneId, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { UiIcon } from './UiIcon';

interface TerminalPaneProps {
  paneId: PaneId;
  displayIndex: number;
  workspace: WorkspaceState;
  onFocus: () => void;
  onPaneDragStart: () => void;
  onPaneDragEnd: () => void;
}

const startedSessions = new Set<PaneId>();
const paneViewportById = new Map<PaneId, number>();

const OSC_CWD_PREFIX = '\u001b]1337;vibe-ade-cwd=';
const OSC_ST = '\u001b\\';
const OSC_BEL = '\u0007';

function clampTerminalDimension(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, rounded));
}

export function TerminalPane({ paneId, displayIndex, workspace, onFocus, onPaneDragStart, onPaneDragEnd }: TerminalPaneProps): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const mentionPanelRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const scheduleFitRef = useRef<(() => void) | null>(null);
  const suppressAutoCloseOnExitRef = useRef(false);
  const closingPaneRef = useRef(false);
  const suppressBootOutputRef = useRef(false);
  const pendingOscRef = useRef('');
  const cmdLineBufferRef = useRef('');
  const outputTailRef = useRef('');
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [currentCwd, setCurrentCwd] = useState<string>(workspace.rootDir);
  const [llmCliActive, setLlmCliActive] = useState(false);
  const [detectedCli, setDetectedCli] = useState<'codex' | 'claude' | 'gemini' | null>(null);
  const [llmAssistAutoEnabled, setLlmAssistAutoEnabled] = useState(true);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionDir, setMentionDir] = useState<string>(workspace.rootDir);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionEntries, setMentionEntries] = useState<Array<{ name: string; path: string; type: 'file' | 'dir' }>>([]);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionBusy, setMentionBusy] = useState(false);
  const [mentionScrollOffset, setMentionScrollOffset] = useState(0);
  const [mentionOverlayTop, setMentionOverlayTop] = useState(34);
  const currentCwdRef = useRef(workspace.rootDir);
  const llmCliActiveRef = useRef(false);
  const detectedCliRef = useRef<'codex' | 'claude' | 'gemini' | null>(null);
  const llmAssistAutoEnabledRef = useRef(true);
  const mentionPickerOpenRef = useRef(false);
  const mentionTypedLenRef = useRef(0);
  const mentionAnchorRowRef = useRef(0);
  const mentionDirRef = useRef(mentionDir);
  const mentionSelectedIndexRef = useRef(mentionSelectedIndex);
  const filteredMentionEntriesRef = useRef<Array<{ name: string; path: string; type: 'file' | 'dir' }>>([]);
  const mentionInlineLinesRef = useRef(0);
  const mentionInlineModeRef = useRef<'above' | 'below'>('below');
  const mentionScrollOffsetRef = useRef(0);
  const pendingFindRef = useRef<{ id: string; query: string } | null>(null);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);
  const terminalFindRequest = useWorkspaceStore((s) => s.ui.terminalFindRequest);

  const shell = workspace.paneShells[paneId] ?? 'powershell';
  const isActivePane = workspace.activePaneId === paneId;
  const statusClass = sessionReady ? 'running' : 'idle';
  const shouldEnableMentionAssist = llmAssistAutoEnabled && llmCliActive && detectedCli === 'codex';

  const filteredMentionEntries = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    if (!query) {
      return mentionEntries;
    }
    return mentionEntries.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [mentionEntries, mentionQuery]);
  const visibleMentionEntries = useMemo(
    () => filteredMentionEntries.slice(mentionScrollOffset, mentionScrollOffset + 12),
    [filteredMentionEntries, mentionScrollOffset]
  );

  useEffect(() => {
    llmCliActiveRef.current = llmCliActive;
  }, [llmCliActive]);

  useEffect(() => {
    detectedCliRef.current = detectedCli;
  }, [detectedCli]);

  useEffect(() => {
    llmAssistAutoEnabledRef.current = llmAssistAutoEnabled;
  }, [llmAssistAutoEnabled]);

  useEffect(() => {
    mentionPickerOpenRef.current = mentionPickerOpen;
  }, [mentionPickerOpen]);

  useEffect(() => {
    currentCwdRef.current = currentCwd;
  }, [currentCwd]);

  useEffect(() => {
    mentionDirRef.current = mentionDir;
  }, [mentionDir]);

  useEffect(() => {
    mentionSelectedIndexRef.current = mentionSelectedIndex;
  }, [mentionSelectedIndex]);

  useEffect(() => {
    filteredMentionEntriesRef.current = filteredMentionEntries;
  }, [filteredMentionEntries]);

  useEffect(() => {
    mentionScrollOffsetRef.current = mentionScrollOffset;
  }, [mentionScrollOffset]);

  useEffect(() => {
    if (!terminalFindRequest || terminalFindRequest.paneId !== paneId) {
      return;
    }
    const terminal = terminalRef.current;
    const searchAddon = searchAddonRef.current;
    const query = terminalFindRequest.query.trim();
    if (!query) {
      return;
    }
    if (!terminal || !searchAddon) {
      pendingFindRef.current = { id: terminalFindRequest.id, query };
      return;
    }
    pendingFindRef.current = null;
    searchAddon.findNext(query);
    terminal.focus();
  }, [terminalFindRequest?.id, paneId]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    const pending = pendingFindRef.current;
    const terminal = terminalRef.current;
    const searchAddon = searchAddonRef.current;
    if (!pending || !terminal || !searchAddon) {
      return;
    }
    pendingFindRef.current = null;
    searchAddon.findNext(pending.query);
    terminal.focus();
  }, [sessionReady]);

  const consumeOscCwd = (chunk: string): string => {
    const combined = pendingOscRef.current + chunk;
    pendingOscRef.current = '';

    let cursor = 0;
    let out = '';
    while (cursor < combined.length) {
      const start = combined.indexOf(OSC_CWD_PREFIX, cursor);
      if (start === -1) {
        out += combined.slice(cursor);
        break;
      }
      out += combined.slice(cursor, start);
      const payloadStart = start + OSC_CWD_PREFIX.length;
      const belIndex = combined.indexOf(OSC_BEL, payloadStart);
      const stIndex = combined.indexOf(OSC_ST, payloadStart);
      let end = -1;
      let terminatorLen = 0;

      if (belIndex !== -1 && (stIndex === -1 || belIndex < stIndex)) {
        end = belIndex;
        terminatorLen = 1;
      } else if (stIndex !== -1) {
        end = stIndex;
        terminatorLen = OSC_ST.length;
      }

      if (end === -1) {
        pendingOscRef.current = combined.slice(start);
        break;
      }

      const cwd = combined.slice(payloadStart, end).trim();
      if (cwd) {
        setCurrentCwd(cwd);
      }
      cursor = end + terminatorLen;
    }

    return out;
  };

  const setLlmCliState = (next: { active: boolean; cli: 'codex' | 'claude' | 'gemini' | null }): void => {
    llmCliActiveRef.current = next.active;
    detectedCliRef.current = next.cli;
    setLlmCliActive(next.active);
    setDetectedCli(next.cli);
  };

  const looksLikeShellPrompt = (line: string): boolean => {
    const trimmed = line.trimEnd();
    if (!trimmed) return false;
    if (/^PS\s+[A-Za-z]:\\.*>\s*$/.test(trimmed)) return true;
    if (/^[A-Za-z]:\\.*>\s*$/.test(trimmed)) return true;
    return false;
  };

  const maybeDetectLlmCliFromCommand = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const first = trimmed.split(/\s+/)[0]?.toLowerCase();
    if (first === 'codex' || first === 'claude' || first === 'gemini') {
      setLlmCliState({ active: true, cli: first });
      return;
    }
    if (llmCliActiveRef.current && (first === 'exit' || first === 'quit' || first === '/exit')) {
      // Best-effort: user intends to leave; we’ll also confirm by detecting the shell prompt again.
      setLlmCliState({ active: false, cli: null });
    }
  };

  const refreshMentionEntries = async (directory: string): Promise<void> => {
    setMentionBusy(true);
    try {
      const entries = await window.vibeAde.terminal.listDirectory({ workspaceId: workspace.id, directory });
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setMentionEntries(sorted);
      setMentionSelectedIndex(0);
      setMentionScrollOffset(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      terminalRef.current?.writeln(`\r\n[mention list failed: ${message}]`);
    } finally {
      setMentionBusy(false);
    }
  };

  const openMentionPicker = async (): Promise<void> => {
    const base = currentCwdRef.current || workspace.rootDir;
    mentionPickerOpenRef.current = true;
    mentionTypedLenRef.current = 1;
    mentionAnchorRowRef.current = terminalRef.current?.buffer.active.cursorY ?? 0;
    setMentionDir(base);
    setMentionQuery('');
    setMentionPickerOpen(true);
    await refreshMentionEntries(base);
  };

  const closeMentionPicker = (mode: 'cancel' | 'insertLiteralAt' = 'cancel'): void => {
    mentionPickerOpenRef.current = false;
    setMentionPickerOpen(false);
    setMentionQuery('');
    setMentionEntries([]);
    setMentionSelectedIndex(0);
    mentionTypedLenRef.current = 0;
    if (mode === 'insertLiteralAt') {
      void window.vibeAde.terminal.sendInput(paneId, '@');
    }
    requestAnimationFrame(() => terminalRef.current?.focus());
  };

  const insertMentionPayload = async (entry: { path: string; type: 'file' | 'dir' }): Promise<void> => {
    setMentionBusy(true);
    try {
      const base = currentCwdRef.current;
      let formatted = entry.path;
      if (base && formatted.toLowerCase().startsWith(base.toLowerCase())) {
        formatted = formatted.slice(base.length).replace(/^[\\/]+/, '');
        if (!formatted) {
          formatted = entry.path;
        }
      }
      const suffix = entry.type === 'dir' && !formatted.endsWith('\\') && !formatted.endsWith('/') ? '\\' : '';
      const mention = `@${formatted}${suffix}`;
      const typedLen = Math.max(0, mentionTypedLenRef.current);
      if (typedLen > 0) {
        await window.vibeAde.terminal.sendInput(paneId, '\u007f'.repeat(typedLen));
      }
      const wrapped = `\u001b[200~${mention}\u001b[201~`;
      await window.vibeAde.terminal.sendInput(paneId, wrapped);
      closeMentionPicker();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      terminalRef.current?.writeln(`\r\n[mention insert failed: ${message}]`);
    } finally {
      setMentionBusy(false);
    }
  };

  const parentDirectory = (dir: string): string | null => {
    const normalized = dir.replace(/[\\/]+$/, '');
    const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
    if (idx <= 2) {
      // Likely drive root like C:\
      return normalized.length >= 3 ? normalized.slice(0, 3) : null;
    }
    return normalized.slice(0, idx);
  };

  const clearInlineMentionMenu = (): void => {
    const terminal = terminalRef.current;
    const lines = mentionInlineLinesRef.current;
    if (!terminal || lines <= 0) {
      mentionInlineLinesRef.current = 0;
      return;
    }
    let seq = '\u001b[s';
    if (mentionInlineModeRef.current === 'below') {
      seq += '\u001b[1B\u001b[0G';
    } else {
      seq += '\u001b[1A\u001b[0G';
    }
    for (let i = 0; i < lines; i += 1) {
      seq += '\u001b[2K';
      if (i < lines - 1) {
        seq += (mentionInlineModeRef.current === 'below') ? '\u001b[1B\u001b[0G' : '\u001b[1A\u001b[0G';
      }
    }
    seq += '\u001b[u';
    terminal.write(seq);
    mentionInlineLinesRef.current = 0;
  };

  const renderInlineMentionMenu = (): void => {
    const terminal = terminalRef.current;
    if (!terminal || !mentionPickerOpenRef.current) {
      clearInlineMentionMenu();
      return;
    }

    const entries = filteredMentionEntriesRef.current.slice(0, 10);
    const header = `@${mentionQuery || ''} in ${mentionDirRef.current}${detectedCli ? ` (${detectedCli})` : ''}`;
    const lines: string[] = [header];

    if (mentionBusy) {
      lines.push('+ Loading...');
    } else if (entries.length === 0) {
      lines.push('+ No matches');
    } else {
      entries.forEach((entry, idx) => {
        const prefix = idx === mentionSelectedIndexRef.current ? '>' : ' ';
        const suffix = entry.type === 'dir' ? '\\' : '';
        lines.push(`${prefix} + ${entry.name}${suffix}`);
      });
    }

    lines.push('Enter insert  Esc close  ↑↓ select');

    clearInlineMentionMenu();
    const cursorY = terminal.buffer.active.cursorY;
    const totalRows = terminal.rows;
    const renderAbove = cursorY + 1 + lines.length >= totalRows;
    mentionInlineModeRef.current = renderAbove ? 'above' : 'below';

    let seq = '\u001b[s';
    seq += renderAbove ? '\u001b[1A\u001b[0G' : '\u001b[1B\u001b[0G';
    lines.forEach((line, index) => {
      seq += line;
      seq += '\u001b[0K';
      if (index < lines.length - 1) {
        seq += renderAbove ? '\u001b[1A\u001b[0G' : '\u001b[1B\u001b[0G';
      }
    });
    seq += '\u001b[u';
    terminal.write(seq);
    mentionInlineLinesRef.current = lines.length;
  };

  const computeMentionOverlayTop = (): number => {
    const terminal = terminalRef.current;
    const host = containerRef.current;
    if (!terminal || !host) return 34;

    const terminalEl = terminal.element;
    if (!terminalEl) return 34;

    const rows = terminalEl.querySelector('.xterm-rows') as HTMLElement | null;
    const firstRow = rows?.firstElementChild as HTMLElement | null;
    const rowHeight = firstRow?.getBoundingClientRect().height ?? 17;

    const cursorY = mentionAnchorRowRef.current;
    const headerHeight = 34;
    const offset = Math.max(0, cursorY + 1) * rowHeight;
    const rawTop = headerHeight + offset;

    const panel = mentionPanelRef.current;
    const hostRect = host.getBoundingClientRect();
    const panelHeight = panel?.getBoundingClientRect().height ?? 220;
    const maxTop = Math.max(34, hostRect.height - panelHeight - 6);
    return Math.min(rawTop, maxTop);
  };

  const resolveTerminalTheme = (): ITheme => {
    const rootStyles = getComputedStyle(document.documentElement);
    const background = rootStyles.getPropertyValue('--bg-panel').trim() || '#1c212c';
    const foreground = rootStyles.getPropertyValue('--text').trim() || '#e6e6e6';
    const accent = rootStyles.getPropertyValue('--accent').trim() || '#3b82f6';
    const base = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

    const withAlpha = (color: string, alpha: number): string => {
      const normalized = color.trim();
      if (normalized.startsWith('rgb')) {
        const values = normalized
          .replace(/rgba?\(/, '')
          .replace(')', '')
          .split(',')
          .map((value) => Number.parseFloat(value.trim()))
          .slice(0, 3);
        if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
          return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`;
        }
      }
      if (normalized.startsWith('#')) {
        const hex = normalized.slice(1);
        const [r, g, b] =
          hex.length === 3
            ? hex.split('').map((ch) => Number.parseInt(ch + ch, 16))
            : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((ch) => Number.parseInt(ch, 16));
        if ([r, g, b].every((value) => Number.isFinite(value))) {
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      return color;
    };

    const ansiPalette: Pick<
      ITheme,
      | 'black'
      | 'red'
      | 'green'
      | 'yellow'
      | 'blue'
      | 'magenta'
      | 'cyan'
      | 'white'
      | 'brightBlack'
      | 'brightRed'
      | 'brightGreen'
      | 'brightYellow'
      | 'brightBlue'
      | 'brightMagenta'
      | 'brightCyan'
      | 'brightWhite'
    > =
      base === 'light'
        ? {
            black: '#0f172a',
            red: '#b91c1c',
            green: '#047857',
            yellow: '#7a5c00',
            blue: '#1d4ed8',
            magenta: '#a21caf',
            cyan: '#0e7490',
            white: '#334155',
            brightBlack: '#64748b',
            brightRed: '#dc2626',
            brightGreen: '#059669',
            brightYellow: '#8a6b00',
            brightBlue: '#2563eb',
            brightMagenta: '#c026d3',
            brightCyan: '#0891b2',
            brightWhite: '#0f172a'
          }
        : {
            black: '#111827',
            red: '#f87171',
            green: '#34d399',
            yellow: '#fbbf24',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#22d3ee',
            white: '#e5e7eb',
            brightBlack: '#9ca3af',
            brightRed: '#fecaca',
            brightGreen: '#a7f3d0',
            brightYellow: '#fde68a',
            brightBlue: '#93c5fd',
            brightMagenta: '#ddd6fe',
            brightCyan: '#a5f3fc',
            brightWhite: '#f9fafb'
          };

    return {
      background,
      foreground,
      cursorAccent: background,
      cursor: accent,
      selectionBackground: withAlpha(accent, 0.28),
      selectionInactiveBackground: withAlpha(accent, 0.16),
      ...ansiPalette
    };
  };

  const pasteFromClipboard = async (): Promise<void> => {
    const text = await window.vibeAde.system.readClipboardText();
    if (text.length > 0) {
      await window.vibeAde.terminal.sendInput(paneId, text);
      return;
    }

    const imageDataUrl = await window.vibeAde.system.readClipboardImageDataUrl();
    if (imageDataUrl) {
      await window.vibeAde.terminal.sendInput(paneId, imageDataUrl);
    }
  };

  useEffect(() => {
    let disposed = false;
    let fitRafId: number | null = null;
    let opened = false;
    let initialFitDone = false;
    let sessionStartRequested = false;
    suppressAutoCloseOnExitRef.current = false;
    closingPaneRef.current = false;

    const terminal = new Terminal({
      // `convertEol` should be avoided with PTY-backed terminals (node-pty handles newline translation).
      convertEol: false,
      cursorBlink: false,
      disableStdin: false,
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 100000,
      theme: resolveTerminalTheme()
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const startOrAttachSession = (): void => {
      if (disposed || !opened || sessionStartRequested) {
        return;
      }
      sessionStartRequested = true;
      const startFreshSession = (): void => {
        startedSessions.add(paneId);
        const cols = clampTerminalDimension(terminal.cols, 120, 2, 500);
        const rows = clampTerminalDimension(terminal.rows, 30, 1, 200);
        void window.vibeAde.terminal
          .startSession({
            workspaceId: workspace.id,
            paneId,
            shell,
            cwd: workspace.rootDir,
            cols,
            rows
          })
          .then(() => {
            if (!disposed) {
              setSessionReady(true);
              scheduleFitRef.current?.();
              // Keep startup clean by clearing shell banner/boot noise.
              setTimeout(() => {
                void window.vibeAde.terminal.executeInSession(paneId, 'cls', true).catch(() => {
                  // Ignore if shell is not yet ready.
                });
              }, 60);
            }
          })
          .catch((error) => {
            startedSessions.delete(paneId);
            if (!disposed) {
              terminal.writeln(`\r\n[terminal start failed: ${String(error)}]`);
              setSessionReady(false);
              sessionStartRequested = false;
            }
          });
      };

      void window.vibeAde.terminal
        .getSessionSnapshot(paneId)
        .then((snapshot) => {
          if (disposed || !opened) {
            return;
          }
          if (snapshot) {
            startedSessions.add(paneId);
            if (snapshot.history) {
              const clean = consumeOscCwd(snapshot.history);
              if (clean) {
                terminal.write(clean);
              }
            }
            setSessionReady(true);
            const previousViewport = paneViewportById.get(paneId);
            if (typeof previousViewport === 'number') {
              requestAnimationFrame(() => {
                if (!disposed) {
                  terminal.scrollToLine(previousViewport);
                }
              });
            }
            return;
          }
          startFreshSession();
        })
        .catch(() => {
          if (!disposed) {
            startFreshSession();
          }
        });
    };

    const scheduleFit = (): void => {
      if (disposed || !opened) {
        return;
      }
      if (fitRafId !== null) {
        cancelAnimationFrame(fitRafId);
      }
      fitRafId = requestAnimationFrame(() => {
        fitRafId = null;
        if (disposed || !opened || !containerRef.current) {
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
          return;
        }
        try {
          fitAddon.fit();
          const cols = clampTerminalDimension(terminal.cols, 120, 2, 500);
          const rows = clampTerminalDimension(terminal.rows, 30, 1, 200);
          void window.vibeAde.terminal.resize(paneId, cols, rows);
          if (!initialFitDone) {
            initialFitDone = true;
            startOrAttachSession();
          }
        } catch {
          // Ignore transient fit errors while DOM/layout is in flux.
        }
      });
    };
    scheduleFitRef.current = scheduleFit;

    if (containerRef.current) {
      terminal.open(containerRef.current);
      opened = true;
      scheduleFit();
    }

    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') {
        return true;
      }

      if (mentionPickerOpenRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMentionPicker();
          return false;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const max = Math.max(0, filteredMentionEntriesRef.current.length - 1);
          setMentionSelectedIndex((idx) => Math.min(idx + 1, max));
          return false;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setMentionSelectedIndex((idx) => Math.max(0, idx - 1));
          return false;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          const selected = filteredMentionEntriesRef.current[mentionSelectedIndexRef.current];
          if (selected) {
            void insertMentionPayload(selected);
          } else {
            void insertMentionPayload({ path: mentionDirRef.current, type: 'dir' });
          }
          return false;
        }
        return true;
      }

      const withPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!withPrimaryModifier || event.altKey) {
        return true;
      }

      const key = event.key.toLowerCase();
      if (key === 'c') {
        const selection = terminal.getSelection();
        if (selection) {
          event.preventDefault();
          void window.vibeAde.system.writeClipboardText(selection);
          return false;
        }
        return true;
      }

      if (key === 'v') {
        event.preventDefault();
        void pasteFromClipboard().catch(() => {
          // Ignore clipboard read failures and keep terminal responsive.
        });
        return false;
      }

      return true;
    });

    const inputDisposable = terminal.onData((data) => {
      if (!disposed) {
        if (data === '\r') {
          maybeDetectLlmCliFromCommand(cmdLineBufferRef.current);
          cmdLineBufferRef.current = '';
          if (!mentionPickerOpenRef.current) {
            void window.vibeAde.terminal.sendInput(paneId, data);
          }
          return;
        }

        // Best-effort line buffer for auto-detect (ignore escape sequences, handle backspace).
        if (data === '\u007f') {
          cmdLineBufferRef.current = cmdLineBufferRef.current.slice(0, -1);
        } else if (!data.startsWith('\u001b') && data.length === 1) {
          cmdLineBufferRef.current += data;
        }

        if (llmAssistAutoEnabledRef.current && llmCliActiveRef.current && detectedCliRef.current === 'codex' && data === '@') {
          // Let Codex see "@", but also show our picker overlay.
          void window.vibeAde.terminal.sendInput(paneId, data);
          void openMentionPicker();
          return;
        }

        if (mentionPickerOpenRef.current) {
          if (data === '\u007f') {
            if (mentionTypedLenRef.current > 0) {
              mentionTypedLenRef.current = Math.max(0, mentionTypedLenRef.current - 1);
            }
            setMentionQuery((prev) => prev.slice(0, -1));
            setMentionSelectedIndex(0);
            if (mentionTypedLenRef.current === 0) {
              closeMentionPicker();
              return;
            }
          } else if (!data.startsWith('\u001b') && data.length === 1 && data !== '\t') {
            mentionTypedLenRef.current += 1;
            setMentionQuery((prev) => `${prev}${data}`);
            setMentionSelectedIndex(0);
          }
        }

        void window.vibeAde.terminal.sendInput(paneId, data);
      }
    });

    let themeRafId: number | null = null;
    const scheduleThemeUpdate = (): void => {
      if (disposed || !opened) {
        return;
      }
      if (themeRafId !== null) {
        cancelAnimationFrame(themeRafId);
      }
      themeRafId = requestAnimationFrame(() => {
        themeRafId = null;
        if (disposed || !opened) {
          return;
        }
        terminal.options.theme = resolveTerminalTheme();
        terminal.refresh(0, Math.max(0, terminal.rows - 1));
      });
    };

    const themeObserver = new MutationObserver(scheduleThemeUpdate);
    // Theme tokens are applied via `documentElement.style.setProperty(...)` (style attribute) and the base mode via `data-theme`.
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

    const unsubscribeData = window.vibeAde.onTerminalData((event) => {
      if (!disposed && opened && event.paneId === paneId) {
        const clean = consumeOscCwd(event.data);
        if (clean) {
          terminal.write(clean);
          outputTailRef.current = (outputTailRef.current + clean).slice(-800);
          const lastLine = outputTailRef.current.split('\n').slice(-1)[0] ?? '';
          if (llmCliActiveRef.current && looksLikeShellPrompt(lastLine)) {
            setLlmCliState({ active: false, cli: null });
          }
        }
      }
    });

    const unsubscribeExit = window.vibeAde.onTerminalExit((event) => {
      if (!disposed && opened && event.paneId === paneId) {
        startedSessions.delete(paneId);
        setSessionReady(false);
        if (closingPaneRef.current) {
          return;
        }
        if (suppressAutoCloseOnExitRef.current) {
          suppressAutoCloseOnExitRef.current = false;
          return;
        }
        if (event.exitCode === 0) {
          closingPaneRef.current = true;
          void removePaneFromLayout(paneId).then((removed) => {
            if (!removed && !disposed) {
              closingPaneRef.current = false;
              terminal.writeln('\r\n[cannot close the last terminal pane]');
            }
          });
          return;
        }
        terminal.writeln(`\r\n[process exited: ${event.exitCode}]`);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    void document.fonts?.ready.then(() => {
      if (!disposed) {
        scheduleFit();
      }
    });

    return () => {
      disposed = true;
      opened = false;
      if (fitRafId !== null) {
        cancelAnimationFrame(fitRafId);
      }
      if (themeRafId !== null) {
        cancelAnimationFrame(themeRafId);
      }
      resizeObserver.disconnect();
      unsubscribeData();
      unsubscribeExit();
      scheduleFitRef.current = null;
      suppressAutoCloseOnExitRef.current = false;
      closingPaneRef.current = false;
      paneViewportById.set(paneId, terminal.buffer.active.viewportY);
      terminalRef.current = null;
      fitAddonRef.current = null;
      inputDisposable.dispose();
      themeObserver.disconnect();
      terminal.dispose();
    };
  }, [paneId, removePaneFromLayout, shell, workspace.id, workspace.rootDir]);

  const restartSession = async (): Promise<void> => {
    suppressAutoCloseOnExitRef.current = true;
    await window.vibeAde.terminal.stopSession(paneId);
    startedSessions.delete(paneId);
    setSessionReady(false);
    try {
      fitAddonRef.current?.fit();
    } catch {
      // Fit errors can happen transiently during layout changes; fall back to last known size.
    }
    const cols = clampTerminalDimension(terminalRef.current?.cols ?? 0, 120, 2, 500);
    const rows = clampTerminalDimension(terminalRef.current?.rows ?? 0, 30, 1, 200);
    await window.vibeAde.terminal.startSession({
      workspaceId: workspace.id,
      paneId,
      shell,
      cwd: workspace.rootDir,
      cols,
      rows
    });
    suppressBootOutputRef.current = false;
    terminalRef.current?.clear();
    setTimeout(() => {
      void window.vibeAde.terminal.executeInSession(paneId, 'cls', true).catch(() => {
        // Ignore if shell is not yet ready.
      });
    }, 60);
    startedSessions.add(paneId);
    setSessionReady(true);
    scheduleFitRef.current?.();
  };

  const closePane = async (): Promise<void> => {
    const removed = await removePaneFromLayout(paneId);
    if (!removed) {
      terminalRef.current?.writeln('\r\n[cannot close the last terminal pane]');
      return;
    }
    closingPaneRef.current = true;
    suppressAutoCloseOnExitRef.current = true;
    startedSessions.delete(paneId);
    await window.vibeAde.terminal.stopSession(paneId);
  };

  useEffect(() => {
    if (mentionPickerOpen && !shouldEnableMentionAssist) {
      mentionPickerOpenRef.current = false;
      setMentionPickerOpen(false);
    }
  }, [mentionPickerOpen, shouldEnableMentionAssist]);

  useEffect(() => {
    if (!mentionPickerOpen) {
      return;
    }
    const nextTop = computeMentionOverlayTop();
    setMentionOverlayTop(nextTop);
  }, [mentionPickerOpen, mentionQuery, mentionDir, mentionSelectedIndex, visibleMentionEntries.length]);

  useEffect(() => {
    const max = Math.max(0, filteredMentionEntries.length - 1);
    if (mentionSelectedIndex > max) {
      setMentionSelectedIndex(max);
      return;
    }
    const offset = mentionScrollOffsetRef.current;
    if (mentionSelectedIndex < offset) {
      setMentionScrollOffset(mentionSelectedIndex);
      return;
    }
    if (mentionSelectedIndex > offset + 11) {
      setMentionScrollOffset(Math.max(0, mentionSelectedIndex - 11));
    }
  }, [mentionSelectedIndex, filteredMentionEntries.length]);

  useEffect(() => {
    if (!actionMenuOpen) {
      return;
    }
    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!actionMenuRef.current || !target) {
        return;
      }
      if (!actionMenuRef.current.contains(target)) {
        setActionMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [actionMenuOpen]);

  return (
    <section
      ref={sectionRef}
      tabIndex={0}
      className={isActivePane ? 'terminal-pane active' : 'terminal-pane'}
      onMouseDown={() => {
        onFocus();
        sectionRef.current?.focus();
        terminalRef.current?.focus();
      }}
    >
      <div className="pane-header" draggable onDragStart={onPaneDragStart} onDragEnd={onPaneDragEnd}>
        <div className="pane-title-wrap">
          <span className={`status-dot ${statusClass}`} />
          <span className="pane-title" title={currentCwd || workspace.rootDir}>
            {currentCwd || workspace.rootDir}
          </span>
        </div>
        <div className="pane-header-actions" ref={actionMenuRef}>
          <button
            className="icon-button"
            title="Terminal actions"
            aria-label="Terminal actions"
            onClick={() => setActionMenuOpen((open) => !open)}
          >
            <UiIcon name="ellipsis" className="ui-icon ui-icon-sm" />
          </button>
          {actionMenuOpen && (
            <div className="terminal-actions-menu">
              <button
                onClick={() => {
                  setActionMenuOpen(false);
                  setLlmAssistAutoEnabled((enabled) => !enabled);
                }}
              >
                {llmAssistAutoEnabled ? 'Disable LLM @ Assist (auto)' : 'Enable LLM @ Assist (auto)'}
              </button>
              <button disabled>
                Detected LLM: {llmCliActive ? (detectedCli ?? 'unknown') : 'none'}
              </button>
              <button
                onClick={() => {
                  setActionMenuOpen(false);
                  void restartSession();
                }}
              >
                Restart Session
              </button>
              <button
                onClick={() => {
                  setActionMenuOpen(false);
                  terminalRef.current?.clear();
                }}
              >
                Clear Output
              </button>
              <button
                className="danger"
                onClick={() => {
                  setActionMenuOpen(false);
                  void closePane();
                }}
              >
                Close Terminal
              </button>
            </div>
          )}
        </div>
      </div>

      {mentionPickerOpen && (
        <div
          className="mention-overlay"
          style={{ top: mentionOverlayTop }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          <div className="mention-panel" ref={mentionPanelRef}>
            <div className="mention-inline-meta" title={mentionDir}>
              @{mentionQuery || ''} <span className="mention-inline-dim">in</span> {mentionDir}
              <span className="mention-inline-dim">{detectedCli ? ` (${detectedCli})` : ''}</span>
            </div>
            <div className="mention-list" role="listbox" aria-label="Mention entries">
              {mentionBusy && <div className="mention-inline-row muted">+ Loading…</div>}
              {!mentionBusy &&
                visibleMentionEntries.map((entry, idx) => (
                  <div
                    key={`${entry.type}:${entry.path}`}
                    className={
                      idx + mentionScrollOffset === mentionSelectedIndex ? 'mention-inline-row selected' : 'mention-inline-row'
                    }
                    onMouseEnter={() => setMentionSelectedIndex(idx + mentionScrollOffset)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void insertMentionPayload(entry);
                    }}
                  >
                    <span className="mention-inline-plus">+</span>
                    <span className="mention-inline-name">
                      {entry.name}
                      {entry.type === 'dir' ? '\\' : ''}
                    </span>
                  </div>
                ))}
              {!mentionBusy && filteredMentionEntries.length === 0 && <div className="mention-inline-row muted">+ No matches</div>}
            </div>
            <div className="mention-inline-footer">
              <span className="mention-inline-dim">Enter</span> insert • <span className="mention-inline-dim">Esc</span> close •{' '}
              <span className="mention-inline-dim">↑↓</span> select{' '}
              {filteredMentionEntries.length > 0 && (
                <span className="mention-inline-dim">
                  ({mentionSelectedIndex + 1}/{filteredMentionEntries.length})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="xterm-host" />
    </section>
  );
}
