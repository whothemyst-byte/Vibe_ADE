import type { WebContents } from 'electron';
import type { AuthManager } from '@main/services/AuthManager';
import type { BillingUsageManager } from '@main/services/BillingUsageManager';
import type { CloudSyncManager } from '@main/services/CloudSyncManager';
import type { TemplateRunner } from '@main/services/TemplateRunner';
import type { TerminalManager } from '@main/services/TerminalManager';
import type { UpdateManager } from '@main/services/UpdateManager';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';
import { registerAuthHandlers } from './authHandlers';
import { registerSwarmHandlers } from './swarmHandlers';
import { registerSystemHandlers } from './systemHandlers';
import { registerTaskHandlers } from './taskHandlers';
import { registerTerminalHandlers } from './terminalHandlers';
import { registerWorkspaceHandlers } from './workspaceHandlers';

interface Dependencies {
  workspaceManager: WorkspaceManager;
  terminalManager: TerminalManager;
  templateRunner: TemplateRunner;
  authManager: AuthManager;
  billingUsageManager: BillingUsageManager;
  cloudSyncManager: CloudSyncManager;
  updateManager: UpdateManager;
  webContents: WebContents;
  setSaveMenuEnabled: (enabled: boolean) => void;
}

export function registerIpcHandlers(deps: Dependencies): void {
  registerWorkspaceHandlers(deps);
  registerSystemHandlers(deps);
  registerTerminalHandlers(deps);
  registerTaskHandlers(deps);
  registerAuthHandlers(deps);
  registerSwarmHandlers(deps);
}
