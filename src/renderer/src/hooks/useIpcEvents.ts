import { useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function useIpcEvents(): void {
  const appendCommandBlock = useWorkspaceStore((s) => s.appendCommandBlock);
  const setAgentOutput = useWorkspaceStore((s) => s.setAgentOutput);
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const saveAsActiveWorkspace = useWorkspaceStore((s) => s.saveAsActiveWorkspace);

  useEffect(() => {
    const unsubscribeAgent = window.vibeAde.onAgentUpdate(({ paneId, output }) => {
      void setAgentOutput(paneId, output);
    });

    const unsubscribeTemplate = window.vibeAde.onTemplateProgress(({ workspaceId, command, output, success }) => {
      const state = useWorkspaceStore.getState();
      const workspace = state.appState.workspaces.find((w) => w.id === workspaceId);
      const paneId = workspace?.activePaneId;
      if (!paneId) {
        return;
      }
      void appendCommandBlock(paneId, {
        id: `${workspaceId}-${Date.now()}`,
        paneId,
        command,
        output,
        exitCode: success ? 0 : 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        collapsed: true
      });
    });

    const unsubscribeMenu = window.vibeAde.onMenuAction(({ action }) => {
      if (action === 'new-environment') {
        openStartPage('home');
      } else if (action === 'open-environment') {
        openStartPage('open');
      } else if (action === 'settings') {
        openSettings();
      } else if (action === 'save-environment') {
        void saveActiveWorkspace();
      } else if (action === 'save-as-environment') {
        void saveAsActiveWorkspace();
      }
    });

    return () => {
      unsubscribeAgent();
      unsubscribeTemplate();
      unsubscribeMenu();
    };
  }, [appendCommandBlock, openSettings, openStartPage, saveActiveWorkspace, saveAsActiveWorkspace, setAgentOutput]);
}
