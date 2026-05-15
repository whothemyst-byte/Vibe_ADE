import { useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { CreateWallForm } from './CreateWallForm';
import { SwarmDashboardDialog } from './SwarmDashboardDialog';

export function CreateFlowOverlay(): JSX.Element | null {
  const ui = useWorkspaceStore((s) => s.ui);
  const closeCreateFlow = useWorkspaceStore((s) => s.closeCreateFlow);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCreateFlow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCreateFlow]);

  if (!ui.createFlowMode) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => closeCreateFlow()}
    >
      {ui.createFlowMode === 'workspace' && (
        <div onClick={(event) => event.stopPropagation()}>
          <CreateWorkspaceForm onCancel={closeCreateFlow} onCreated={closeCreateFlow} />
        </div>
      )}

      {ui.createFlowMode === 'canvas' && (
        <div onClick={(event) => event.stopPropagation()}>
          <CreateWallForm onCancel={closeCreateFlow} onCreated={closeCreateFlow} />
        </div>
      )}

      {ui.createFlowMode === 'swarm' && (
        <div onClick={(event) => event.stopPropagation()}>
          <SwarmDashboardDialog embedded onRequestClose={closeCreateFlow} />
        </div>
      )}
    </div>
  );
}
