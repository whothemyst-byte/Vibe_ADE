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
    runStructuredCommand: (input) => ipcRenderer.invoke('terminal:runStructuredCommand', input)
  },
  agent: {
    start: (input) => ipcRenderer.invoke('agent:start', input),
    stop: (paneId) => ipcRenderer.invoke('agent:stop', paneId)
  },
  system: {
    selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
    setSaveMenuEnabled: (enabled) => ipcRenderer.invoke('system:setSaveMenuEnabled', enabled)
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
  onAgentUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on('agent:update', handler);
    return () => ipcRenderer.off('agent:update', handler);
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
  }
};

contextBridge.exposeInMainWorld('vibeAde', api);
