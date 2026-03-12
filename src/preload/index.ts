import { contextBridge, ipcRenderer } from 'electron';
import type { VibeAdeApi } from '@shared/ipc';

const api: VibeAdeApi = {
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (input) => ipcRenderer.invoke('workspace:create', input),
    clone: (workspaceId, newName) => ipcRenderer.invoke('workspace:clone', workspaceId, newName),
    rename: (workspaceId, name) => ipcRenderer.invoke('workspace:rename', workspaceId, name),
    remove: (workspaceId) => ipcRenderer.invoke('workspace:remove', workspaceId),
    setActive: (workspaceId) => ipcRenderer.invoke('workspace:setActive', workspaceId),
    save: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
    listTemplates: () => ipcRenderer.invoke('workspace:listTemplates')
  },
  terminal: {
    startSession: (input) => ipcRenderer.invoke('terminal:startSession', input),
    stopSession: (paneId) => ipcRenderer.invoke('terminal:stopSession', paneId),
    sendInput: (paneId, input) => ipcRenderer.invoke('terminal:sendInput', paneId, input),
    executeInSession: (paneId, command, forceSubmit) =>
      ipcRenderer.invoke('terminal:executeInSession', paneId, command, forceSubmit),
    resize: (paneId, cols, rows) => ipcRenderer.invoke('terminal:resize', paneId, cols, rows),
    getSessionSnapshot: (paneId) => ipcRenderer.invoke('terminal:getSessionSnapshot', paneId),
    runStructuredCommand: (input) => ipcRenderer.invoke('terminal:runStructuredCommand', input)
  },
  system: {
    selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
    setSaveMenuEnabled: (enabled) => ipcRenderer.invoke('system:setSaveMenuEnabled', enabled),
    setWindowTheme: (input) => ipcRenderer.invoke('system:setWindowTheme', input),
    performMenuAction: (action) => ipcRenderer.invoke('system:performMenuAction', action),
    readClipboardText: () => ipcRenderer.invoke('system:readClipboardText'),
    readClipboardImageDataUrl: () => ipcRenderer.invoke('system:readClipboardImageDataUrl'),
    writeClipboardText: (text) => ipcRenderer.invoke('system:writeClipboardText', text)
  },
  auth: {
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    login: (email, password) => ipcRenderer.invoke('auth:login', email, password),
    signup: (email, password) => ipcRenderer.invoke('auth:signup', email, password),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  cloud: {
    getStatus: () => ipcRenderer.invoke('cloud:getStatus'),
    listRemoteWorkspaces: () => ipcRenderer.invoke('cloud:listRemoteWorkspaces'),
    getSyncPreview: () => ipcRenderer.invoke('cloud:getSyncPreview'),
    pushLocalState: () => ipcRenderer.invoke('cloud:pushLocalState'),
    pullRemoteToLocal: () => ipcRenderer.invoke('cloud:pullRemoteToLocal')
  },
  task: {
    list: (workspaceId) => ipcRenderer.invoke('task:list', workspaceId),
    create: (workspaceId, input) => ipcRenderer.invoke('task:create', workspaceId, input),
    update: (workspaceId, taskId, patch) => ipcRenderer.invoke('task:update', workspaceId, taskId, patch),
    delete: (workspaceId, taskId) => ipcRenderer.invoke('task:delete', workspaceId, taskId),
    move: (workspaceId, taskId, toStatus, toIndex) => ipcRenderer.invoke('task:move', workspaceId, taskId, toStatus, toIndex),
    archive: (workspaceId, taskId, archived) => ipcRenderer.invoke('task:archive', workspaceId, taskId, archived)
  },
  swarm: {
    create: (config) => ipcRenderer.invoke('swarm:create', config),
    status: (swarmId) => ipcRenderer.invoke('swarm:status', swarmId),
    state: (swarmId) => ipcRenderer.invoke('swarm:state', swarmId),
    events: (swarmId, count) => ipcRenderer.invoke('swarm:events', swarmId, count),
    agentOutput: (swarmId, maxLines) => ipcRenderer.invoke('swarm:agentOutput', swarmId, maxLines),
    stop: (swarmId) => ipcRenderer.invoke('swarm:stop', swarmId)
  },
  onTerminalData: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.off('terminal:data', handler);
  },
  onTerminalExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.off('terminal:exit', handler);
  },
  onTemplateProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('template:progress', handler);
    return () => ipcRenderer.off('template:progress', handler);
  },
  onMenuAction: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('app:menuAction', handler);
    return () => ipcRenderer.off('app:menuAction', handler);
  },
  onSwarmUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('swarm:update', handler);
    return () => ipcRenderer.off('swarm:update', handler);
  },
  onSwarmAgentStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('swarm:agent-status', handler);
    return () => ipcRenderer.off('swarm:agent-status', handler);
  },
  onSwarmEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('swarm:event', handler);
    return () => ipcRenderer.off('swarm:event', handler);
  }
};

contextBridge.exposeInMainWorld('vibeAde', api);

// ---- QuanSwarm UI relay ----
// Convert main-process IPC events into DOM CustomEvents consumed by SwarmBoard.
ipcRenderer.on('swarm:update', (_event, payload: { swarmId: string; state: unknown }) => {
  window.dispatchEvent(new CustomEvent('vibe:swarm-update', { detail: payload }));
});

ipcRenderer.on('swarm:agent-status', (_event, payload: { swarmId: string; agent: unknown }) => {
  window.dispatchEvent(new CustomEvent('vibe:agent-status', { detail: payload }));
});

ipcRenderer.on('swarm:event', (_event, payload: { swarmId: string; event: unknown }) => {
  window.dispatchEvent(new CustomEvent('vibe:swarm-event', { detail: payload }));
});

ipcRenderer.on('swarm:agent-output', (_event, payload: { swarmId: string; agentId: string; role: string; data: string; timestamp: number }) => {
  window.dispatchEvent(new CustomEvent('vibe:swarm-agent-output', { detail: payload }));
});
