import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
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

export function TerminalPane({ paneId, displayIndex, workspace, onFocus, onPaneDragStart, onPaneDragEnd }: TerminalPaneProps): JSX.Element {
  const sectionRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const scheduleFitRef = useRef<(() => void) | null>(null);
  const suppressAutoCloseOnExitRef = useRef(false);
  const closingPaneRef = useRef(false);
  const suppressBootOutputRef = useRef(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);

  const shell = workspace.paneShells[paneId] ?? 'powershell';
  const isActivePane = workspace.activePaneId === paneId;
  const statusClass = sessionReady ? 'running' : 'idle';

  const resolveTerminalTheme = (): {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    selectionInactiveBackground: string;
  } => {
    const rootStyles = getComputedStyle(document.documentElement);
    const background = rootStyles.getPropertyValue('--bg-panel').trim() || '#1c212c';
    const foreground = rootStyles.getPropertyValue('--text').trim() || '#e6e6e6';
    const accent = rootStyles.getPropertyValue('--accent').trim() || '#3b82f6';

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

    return {
      background,
      foreground,
      cursor: accent,
      selectionBackground: withAlpha(accent, 0.28),
      selectionInactiveBackground: withAlpha(accent, 0.16)
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
      convertEol: true,
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
    terminal.loadAddon(fitAddon);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const startOrAttachSession = (): void => {
      if (disposed || !opened || sessionStartRequested) {
        return;
      }
      sessionStartRequested = true;
      const startFreshSession = (): void => {
        startedSessions.add(paneId);
        void window.vibeAde.terminal
          .startSession({
            workspaceId: workspace.id,
            paneId,
            shell,
            cwd: workspace.rootDir
          })
          .then(() => {
            if (!disposed) {
              setSessionReady(true);
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
              terminal.write(snapshot.history);
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
          void window.vibeAde.terminal.resize(paneId, terminal.cols, terminal.rows);
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
        void window.vibeAde.terminal.sendInput(paneId, data);
      }
    });

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = resolveTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const unsubscribeData = window.vibeAde.onTerminalData((event) => {
      if (!disposed && opened && event.paneId === paneId) {
        terminal.write(event.data);
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
    await window.vibeAde.terminal.startSession({
      workspaceId: workspace.id,
      paneId,
      shell,
      cwd: workspace.rootDir
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
          <span className="pane-title">terminal-{displayIndex}</span>
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

      <div ref={containerRef} className="xterm-host" />
    </section>
  );
}
