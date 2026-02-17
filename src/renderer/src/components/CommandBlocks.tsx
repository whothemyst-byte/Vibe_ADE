import type { CommandBlock, PaneId, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

interface CommandBlocksProps {
  paneId: PaneId;
  blocks: CommandBlock[];
  workspace: WorkspaceState;
}

export function CommandBlocks({ paneId, blocks, workspace }: CommandBlocksProps): JSX.Element {
  const appendCommandBlock = useWorkspaceStore((s) => s.appendCommandBlock);

  const rerun = async (command: string): Promise<void> => {
    const shell = workspace.paneShells[paneId] ?? 'cmd';
    const block = await window.vibeAde.terminal.runStructuredCommand({
      paneId,
      shell,
      cwd: workspace.rootDir,
      command
    });
    await appendCommandBlock(paneId, block);
  };

  return (
    <div className="command-blocks">
      {blocks.length === 0 && <div className="command-block-empty">No command blocks yet.</div>}
      {blocks.map((block) => (
        <article key={block.id} className="command-block">
          <div className="command-block-header compact">
            <span className="command-chevron">{'>'}</span>
            <code>{block.command}</code>
            <span className={block.exitCode === 0 ? 'exit-ok' : 'exit-fail'}>exit {block.exitCode ?? '?'}</span>
            <div className="command-block-actions">
              <button className="icon-button" title="Re-run" aria-label="Re-run" onClick={() => void rerun(block.command)}>
                {'\u21BB'}
              </button>
              <button
                className="icon-button"
                title="Copy Command"
                aria-label="Copy Command"
                onClick={() => void navigator.clipboard.writeText(block.command)}
              >
                {'\u2398'}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
