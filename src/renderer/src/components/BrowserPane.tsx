import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { BrowserPaneState, BrowserTabState, PaneId, WorkspaceState } from '@shared/types';
import { getActiveBrowserTab, syncBrowserPaneFromActiveTab } from '@shared/browserPane';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { Icon, cn } from './ui';

interface BrowserPaneProps {
  paneId: PaneId;
  workspace: WorkspaceState;
  onFocus: () => void;
  onPaneDragStart: () => void;
  onPaneDragEnd: () => void;
}

function normalizeBrowserInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) || trimmed.startsWith('about:') || trimmed.startsWith('file:') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  if (/^(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/|$)/.test(trimmed) || trimmed.includes('.')) {
    return `https://${trimmed}`;
  }
  return `https://${trimmed}`;
}

function applyBrowserTabNavigation(
  current: BrowserTabState | undefined,
  url: string,
  title: string,
  isLoading: boolean
): BrowserTabState {
  const history = current?.history?.length ? [...current.history] : [url];
  const historyIndex = current?.historyIndex ?? history.length - 1;
  let nextHistory = history;
  let nextHistoryIndex = Math.max(0, Math.min(history.length - 1, historyIndex));

  if (history.length === 0) {
    nextHistory = [url];
    nextHistoryIndex = 0;
  } else if (nextHistory[nextHistoryIndex - 1] === url) {
    nextHistoryIndex = Math.max(0, nextHistoryIndex - 1);
  } else if (nextHistory[nextHistoryIndex + 1] === url) {
    nextHistoryIndex = Math.min(nextHistory.length - 1, nextHistoryIndex + 1);
  } else if (nextHistory[nextHistoryIndex] !== url) {
    nextHistory = nextHistory.slice(0, nextHistoryIndex + 1);
    nextHistory.push(url);
    nextHistoryIndex = nextHistory.length - 1;
  }

  return {
    id: current?.id ?? '',
    url,
    title,
    isLoading,
    history: nextHistory,
    historyIndex: nextHistoryIndex
  };
}

export function BrowserPane({ paneId, workspace, onFocus, onPaneDragStart, onPaneDragEnd }: BrowserPaneProps): JSX.Element {
  const updateBrowserPane = useWorkspaceStore((s) => s.updateBrowserPane);
  const addBrowserTabToLayout = useWorkspaceStore((s) => s.addBrowserTabToLayout);
  const closeBrowserTab = useWorkspaceStore((s) => s.closeBrowserTab);
  const setActiveBrowserTab = useWorkspaceStore((s) => s.setActiveBrowserTab);
  const moveBrowserTabToLayout = useWorkspaceStore((s) => s.moveBrowserTabToLayout);
  const moveBrowserTabToLayoutEnd = useWorkspaceStore((s) => s.moveBrowserTabToLayoutEnd);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);
  const browserPane = workspace.browserPanes[paneId];
  const activeTab = useMemo(() => (browserPane ? getActiveBrowserTab(browserPane) : undefined), [browserPane]);
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const browserPaneRef = useRef<BrowserPaneState | undefined>(browserPane);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<string | null>(null);
  const [addressValue, setAddressValue] = useState(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const isActivePane = workspace.activePaneId === paneId;
  const canClose = collectPaneIds(workspace.layout).length > 1;
  const canCloseTab = (browserPane?.tabs?.length ?? 0) > 1;

  const resolvedUrl = useMemo(() => activeTab?.url || 'about:blank', [activeTab?.url]);
  const isPlaceholder = resolvedUrl === 'about:blank' || resolvedUrl.trim().length === 0;

  useEffect(() => {
    browserPaneRef.current = browserPane;
    setAddressValue(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    setCanGoBack((activeTab?.historyIndex ?? 0) > 0);
    const historyLength = activeTab?.history?.length ?? 0;
    const historyIndex = activeTab?.historyIndex ?? 0;
    setCanGoForward(historyLength > 0 && historyIndex < historyLength - 1);
  }, [activeTab?.history, activeTab?.historyIndex, activeTab?.isLoading, activeTab?.title, activeTab?.url, browserPane]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const syncNavigationState = (): void => {
      try {
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      } catch {
        setCanGoBack(false);
        setCanGoForward(false);
      }
    };

    const pushBrowserState = (next: { url?: string; title?: string; isLoading?: boolean }): void => {
      const current = browserPaneRef.current;
      if (!current) {
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const currentUrl = currentTab.url ?? 'about:blank';
      const url = next.url ?? currentUrl;
      const title = next.title ?? currentTab.title ?? url;
      const nextTab = applyBrowserTabNavigation(currentTab, url, title, next.isLoading ?? false);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      setAddressValue(url);
      syncNavigationState();
    };

    const handleDidStartLoading = (): void => {
      const current = browserPaneRef.current;
      if (!current) {
        return;
      }
      const nextTab = applyBrowserTabNavigation(getActiveBrowserTab(current), getActiveBrowserTab(current).url, getActiveBrowserTab(current).title, true);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      syncNavigationState();
    };

    const handleDidStopLoading = (): void => {
      const current = browserPaneRef.current;
      if (!current) {
        syncNavigationState();
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const currentUrl = webview.getURL() || currentTab.url || 'about:blank';
      const currentTitle = webview.getTitle() || currentTab.title || currentUrl;
      const nextTab = applyBrowserTabNavigation(currentTab, currentUrl, currentTitle, false);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      setAddressValue(currentUrl);
      syncNavigationState();
    };

    const handleNavigate = (event: Event & { url?: string }): void => {
      const current = browserPaneRef.current;
      if (!current) {
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const url = event.url ?? webview.getURL() ?? currentTab.url ?? 'about:blank';
      const title = webview.getTitle() || currentTab.title || url;
      pushBrowserState({ url, title, isLoading: false });
    };

    const handleTitleUpdated = (event: Event & { title?: string }): void => {
      const current = browserPaneRef.current;
      if (!current) {
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const title = event.title ?? webview.getTitle() ?? currentTab.title ?? webview.getURL() ?? 'about:blank';
      const nextTab = applyBrowserTabNavigation(currentTab, currentTab.url, title, currentTab.isLoading);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      syncNavigationState();
    };

    const handleNewWindow = (event: Event & { url?: string; preventDefault?: () => void }): void => {
      event.preventDefault?.();
      const url = event.url ?? webview.getURL();
      if (!url) {
        return;
      }
      const current = browserPaneRef.current;
      if (!current) {
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const nextTab = applyBrowserTabNavigation(currentTab, url, webview.getTitle() || currentTab.title || url, true);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      webview.loadURL(url);
    };

    const handleDidFailLoad = (): void => {
      const current = browserPaneRef.current;
      if (!current) {
        syncNavigationState();
        return;
      }
      const currentTab = getActiveBrowserTab(current);
      const currentUrl = webview.getURL() || currentTab.url || 'about:blank';
      const nextTab = applyBrowserTabNavigation(currentTab, currentUrl, currentTab.title || currentUrl, false);
      const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
      browserPaneRef.current = nextPane;
      updateBrowserPane(workspace.id, paneId, nextPane);
      syncNavigationState();
    };

    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('new-window', handleNewWindow);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    syncNavigationState();

    const handleBrowserContextAction = (event: { webContentsId: number; action: 'view-source' | 'inspect'; url: string; sourceHtml?: string; pageTitle?: string }): void => {
      if (event.webContentsId !== webview.getWebContentsId()) {
        return;
      }
      if (event.action === 'view-source') {
        const sourceUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(event.sourceHtml || 'Source unavailable')}`;
        void addBrowserTabToLayout(workspace.id, paneId, {
          url: sourceUrl,
          title: event.pageTitle ? `View Source - ${event.pageTitle}` : 'View Source'
        });
        return;
      }
      webview.openDevTools({ mode: 'bottom' });
    };

    const unsubscribeBrowserAction = window.vibeAde.onBrowserContextAction(handleBrowserContextAction);

    return () => {
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('page-title-updated', handleTitleUpdated);
      webview.removeEventListener('new-window', handleNewWindow);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      unsubscribeBrowserAction();
    };
  }, [addBrowserTabToLayout, paneId, updateBrowserPane, workspace.id]);

  const navigate = (): void => {
    const nextUrl = normalizeBrowserInput(addressValue);
    const current = browserPaneRef.current;
    if (!current) {
      return;
    }
    const currentTab = getActiveBrowserTab(current);
    const nextTab = applyBrowserTabNavigation(currentTab, nextUrl, nextUrl, true);
    const nextPane = syncBrowserPaneFromActiveTab(current, nextTab);
    browserPaneRef.current = nextPane;
    updateBrowserPane(workspace.id, paneId, nextPane);
    webviewRef.current?.loadURL(nextUrl);
  };

  const goBack = (): void => {
    if (!canGoBack) {
      return;
    }
    webviewRef.current?.goBack();
  };

  const goForward = (): void => {
    if (!canGoForward) {
      return;
    }
    webviewRef.current?.goForward();
  };

  const reload = (): void => {
    webviewRef.current?.reload();
  };

  const openExternally = (): void => {
    if (!resolvedUrl || resolvedUrl === 'about:blank') {
      return;
    }
    void window.vibeAde.system.openExternal(resolvedUrl);
  };

  const closePane = async (): Promise<void> => {
    await removePaneFromLayout(paneId);
  };

  const handlePaneDragStart = (event: DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', paneId);
    onPaneDragStart();
  };

  const handleTabDragStart = (event: DragEvent<HTMLDivElement>, tabId: string): void => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
    setDraggedTabId(tabId);
    setDropTargetTabId(null);
  };

  const handleTabDragEnd = (): void => {
    setDraggedTabId(null);
    setDropTargetTabId(null);
  };

  const handleTabDrop = (targetTabId: string): void => {
    if (!draggedTabId || draggedTabId === targetTabId) {
      handleTabDragEnd();
      return;
    }
    moveBrowserTabToLayout(workspace.id, paneId, draggedTabId, targetTabId);
    handleTabDragEnd();
  };

  const handleTabDropToEnd = (): void => {
    if (!draggedTabId) {
      handleTabDragEnd();
      return;
    }
    moveBrowserTabToLayoutEnd(workspace.id, paneId, draggedTabId);
    handleTabDragEnd();
  };


  return (
    <section
      className={cn(
        'browser-pane relative flex flex-col h-full overflow-hidden rounded-sm border bg-bg-panel transition-colors',
        isActivePane ? 'border-primary' : 'border-line'
      )}
      onMouseDown={() => {
        onFocus();
      }}
    >
      <div
        className="flex items-center gap-1 px-2 pt-1.5 pb-0 border-b border-line bg-bg-panel-2/40 select-none"
        draggable
        onDragStart={handlePaneDragStart}
        onDragEnd={onPaneDragEnd}
      >
        <div
          className="flex-1 flex items-end gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Browser tabs"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleTabDropToEnd();
          }}
        >
          {(browserPane?.tabs ?? []).map((tab) => {
            const isActiveTab = tab.id === browserPane?.activeTabId;
            const tabTitle = tab.title && tab.title !== 'about:blank' ? tab.title : 'New Tab';
            const isDropTarget = dropTargetTabId === tab.id;
            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-1 min-w-0 max-w-[200px] px-2 py-1 rounded-t-md border-b-0 text-xs transition-colors',
                  isActiveTab
                    ? 'bg-bg-panel text-fg border border-line shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2/70',
                  isDropTarget && 'ring-2 ring-primary/50'
                )}
                draggable
                onDragStart={(event) => handleTabDragStart(event, tab.id)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedTabId && draggedTabId !== tab.id) {
                    setDropTargetTabId(tab.id);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetTabId === tab.id) {
                    setDropTargetTabId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleTabDrop(tab.id);
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActiveTab}
                  title={tab.title || tab.url}
                  className="flex-1 min-w-0 text-left truncate"
                  onClick={() => {
                    setActiveBrowserTab(workspace.id, paneId, tab.id);
                  }}
                >
                  <span className="truncate">{tabTitle}</span>
                </button>
                <button
                  className="shrink-0 h-4 w-4 grid place-items-center rounded text-fg-muted hover:text-fg hover:bg-bg-panel disabled:opacity-30 disabled:cursor-not-allowed"
                  type="button"
                  aria-label={`Close tab ${tabTitle}`}
                  title={canCloseTab ? 'Close tab' : 'At least one tab must remain open'}
                  disabled={!canCloseTab}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeBrowserTab(workspace.id, paneId, tab.id);
                  }}
                >
                  <Icon name="close" size="xs" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="shrink-0 h-6 w-6 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
          type="button"
          aria-label="New tab"
          title="New tab"
          onDragOver={(event) => {
            event.preventDefault();
            if (draggedTabId) {
              setDropTargetTabId(null);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleTabDropToEnd();
          }}
          onClick={() => {
            void addBrowserTabToLayout(workspace.id, paneId, { url: 'about:blank', title: 'New Tab' });
          }}
        >
          <Icon name="add" size="sm" />
        </button>
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line bg-bg-panel">
        <NavBtn icon="arrow_back" onClick={goBack} disabled={!canGoBack} label="Back" />
        <NavBtn icon="arrow_forward" onClick={goForward} disabled={!canGoForward} label="Forward" />
        <NavBtn icon="refresh" onClick={reload} label="Reload" />

        <div className="flex-1 mx-1.5">
          <input
            className="w-full h-7 px-3 text-xs font-mono rounded-md bg-bg-panel-2/60 border border-line text-fg placeholder:text-fg-muted focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
            value={addressValue}
            placeholder="Search or enter address"
            spellCheck={false}
            onChange={(event) => setAddressValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                navigate();
              }
            }}
            onFocus={onFocus}
            aria-label="Search or enter address"
          />
        </div>

        <NavBtn icon="open_in_new" onClick={openExternally} label="Open externally" />
        <NavBtn icon="close" onClick={() => void closePane()} disabled={!canClose} label="Close browser pane" />
      </div>

      <div className="relative flex-1 bg-bg-page">
        <webview
          ref={webviewRef}
          className="browser-webview w-full h-full"
          src={resolvedUrl}
          allowpopups
          partition={`persist:vibe-ade-browser-${paneId}`}
        />
        {isPlaceholder && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg-page pointer-events-none"
            aria-hidden="true"
          >
            <div className="h-7 w-7 rounded bg-primary/15 text-primary grid place-items-center">
              <Icon name="globe" size="xl" />
            </div>
            <div className="font-mono text-[11px] font-semibold tracking-[0.22em] uppercase text-fg">
              NO_CONTENT_LOADED
            </div>
            <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-fg-muted">
              AWAITING_EXTERNAL_SIGNAL
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NavBtn({
  icon,
  onClick,
  disabled,
  label
}: {
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className="shrink-0 h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size="sm" />
    </button>
  );
}
