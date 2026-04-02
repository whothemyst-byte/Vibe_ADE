import { v4 as uuidv4 } from 'uuid';
import type { BrowserPaneState, BrowserTabState, PaneId } from './types';

export const DEFAULT_BROWSER_URL = 'about:blank';

function normalizeUrl(value: unknown, fallbackUrl = DEFAULT_BROWSER_URL): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallbackUrl;
}

function normalizeHistory(value: unknown, url: string): string[] {
  const history = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return history.length > 0 ? history : [url];
}

function normalizeHistoryIndex(value: unknown, historyLength: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(0, historyLength - 1);
  }
  return Math.max(0, Math.min(historyLength - 1, Math.floor(value)));
}

export function normalizeBrowserTabState(tab: Partial<BrowserTabState> | undefined, fallbackUrl = DEFAULT_BROWSER_URL): BrowserTabState {
  const url = normalizeUrl(tab?.url, fallbackUrl);
  const history = normalizeHistory(tab?.history, url);
  const historyIndex = normalizeHistoryIndex(tab?.historyIndex, history.length);

  return {
    id: typeof tab?.id === 'string' && tab.id.trim().length > 0 ? tab.id : uuidv4(),
    url,
    title: typeof tab?.title === 'string' && tab.title.trim() ? tab.title : url,
    isLoading: Boolean(tab?.isLoading),
    history,
    historyIndex
  };
}

export function createBrowserTabState(input?: { url?: string; title?: string }): BrowserTabState {
  const url = normalizeUrl(input?.url);
  return normalizeBrowserTabState(
    {
      id: uuidv4(),
      url,
      title: input?.title ?? url,
      isLoading: false,
      history: [url],
      historyIndex: 0
    },
    url
  );
}

function syncBrowserPaneState(
  pane: Partial<BrowserPaneState> & {
    tabs: BrowserTabState[];
    activeTabId: string;
  },
  fallbackUrl = DEFAULT_BROWSER_URL
): BrowserPaneState {
  const tabs = pane.tabs.length > 0 ? pane.tabs.map((tab) => normalizeBrowserTabState(tab, fallbackUrl)) : [createBrowserTabState({ url: fallbackUrl })];
  const activeTab = tabs.find((tab) => tab.id === pane.activeTabId) ?? tabs[0];

  return {
    sourcePaneId: typeof pane.sourcePaneId === 'string' && pane.sourcePaneId.trim().length > 0 ? pane.sourcePaneId : undefined,
    activeTabId: activeTab.id,
    tabs,
    url: activeTab.url,
    title: activeTab.title,
    isLoading: activeTab.isLoading,
    history: [...activeTab.history],
    historyIndex: activeTab.historyIndex
  };
}

export function normalizeBrowserPaneState(pane: Partial<BrowserPaneState> | undefined, fallbackUrl = DEFAULT_BROWSER_URL): BrowserPaneState {
  const rawTabs = Array.isArray(pane?.tabs) && pane.tabs.length > 0 ? pane.tabs : undefined;
  const tabs = rawTabs?.map((tab) => normalizeBrowserTabState(tab, fallbackUrl));
  if (tabs && tabs.length > 0 && typeof pane?.activeTabId === 'string' && tabs.some((tab) => tab.id === pane.activeTabId)) {
    return syncBrowserPaneState(
      {
        sourcePaneId: pane?.sourcePaneId,
        activeTabId: pane.activeTabId,
        tabs
      },
      fallbackUrl
    );
  }

  const fallbackTab = normalizeBrowserTabState(
    {
      id: pane?.activeTabId,
      url: pane?.url,
      title: pane?.title,
      isLoading: pane?.isLoading,
      history: pane?.history,
      historyIndex: pane?.historyIndex
    },
    fallbackUrl
  );

  const normalizedTabs = tabs && tabs.length > 0 ? tabs : [fallbackTab];
  const activeTabId = typeof pane?.activeTabId === 'string' && normalizedTabs.some((tab) => tab.id === pane.activeTabId)
    ? pane.activeTabId
    : normalizedTabs[0].id;

  return syncBrowserPaneState(
    {
      sourcePaneId: pane?.sourcePaneId,
      activeTabId,
      tabs: normalizedTabs
    },
    fallbackUrl
  );
}

export function createBrowserPaneState(input?: { sourcePaneId?: PaneId; url?: string; title?: string }): BrowserPaneState {
  const tab = createBrowserTabState({ url: input?.url, title: input?.title });
  return syncBrowserPaneState(
    {
      sourcePaneId: input?.sourcePaneId,
      activeTabId: tab.id,
      tabs: [tab]
    },
    tab.url
  );
}

export function getActiveBrowserTab(pane: BrowserPaneState): BrowserTabState {
  return pane.tabs.find((tab) => tab.id === pane.activeTabId) ?? pane.tabs[0] ?? createBrowserTabState();
}

export function syncBrowserPaneFromActiveTab(
  pane: BrowserPaneState,
  patch: Partial<BrowserTabState>
): BrowserPaneState {
  const active = getActiveBrowserTab(pane);
  const nextTab = normalizeBrowserTabState({ ...active, ...patch }, active.url);
  const tabs = pane.tabs.map((tab) => (tab.id === active.id ? nextTab : tab));
  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId: nextTab.id,
      tabs
    },
    nextTab.url
  );
}

export function appendBrowserTabToPane(
  pane: BrowserPaneState,
  input?: { url?: string; title?: string }
): BrowserPaneState {
  const nextTab = createBrowserTabState({ url: input?.url, title: input?.title });
  const tabs = [...pane.tabs.map((tab) => normalizeBrowserTabState(tab, tab.url)), nextTab];
  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId: nextTab.id,
      tabs
    },
    nextTab.url
  );
}

export function moveBrowserTabInPane(
  pane: BrowserPaneState,
  sourceTabId: string,
  targetTabId: string
): BrowserPaneState {
  if (sourceTabId === targetTabId) {
    return pane;
  }
  const sourceIndex = pane.tabs.findIndex((tab) => tab.id === sourceTabId);
  const targetIndex = pane.tabs.findIndex((tab) => tab.id === targetTabId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return pane;
  }

  const nextTabs = [...pane.tabs];
  const [movedTab] = nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(targetIndex, 0, movedTab);

  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId: pane.activeTabId,
      tabs: nextTabs.map((tab) => normalizeBrowserTabState(tab, tab.url))
    },
    pane.url
  );
}

export function moveBrowserTabToEnd(
  pane: BrowserPaneState,
  sourceTabId: string
): BrowserPaneState {
  const sourceIndex = pane.tabs.findIndex((tab) => tab.id === sourceTabId);
  if (sourceIndex < 0 || sourceIndex === pane.tabs.length - 1) {
    return pane;
  }

  const nextTabs = [...pane.tabs];
  const [movedTab] = nextTabs.splice(sourceIndex, 1);
  nextTabs.push(movedTab);

  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId: pane.activeTabId,
      tabs: nextTabs.map((tab) => normalizeBrowserTabState(tab, tab.url))
    },
    pane.url
  );
}

export function setActiveBrowserTab(
  pane: BrowserPaneState,
  tabId: string
): BrowserPaneState {
  if (!pane.tabs.some((tab) => tab.id === tabId)) {
    return pane;
  }
  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId: tabId,
      tabs: pane.tabs.map((tab) => normalizeBrowserTabState(tab, tab.url))
    },
    pane.url
  );
}

export function removeBrowserTabFromPane(
  pane: BrowserPaneState,
  tabId: string
): BrowserPaneState {
  if (pane.tabs.length <= 1) {
    return pane;
  }
  const remaining = pane.tabs.filter((tab) => tab.id !== tabId).map((tab) => normalizeBrowserTabState(tab, tab.url));
  if (remaining.length === 0) {
    return pane;
  }
  const activeTabId = pane.activeTabId === tabId ? remaining[0].id : pane.activeTabId;
  return syncBrowserPaneState(
    {
      sourcePaneId: pane.sourcePaneId,
      activeTabId,
      tabs: remaining
    },
    remaining[0].url
  );
}
