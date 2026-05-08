import { Icon } from './ui';

interface Props {
  llmAssistAutoEnabled: boolean;
  llmCliActive: boolean;
  detectedCli: 'codex' | 'claude' | 'gemini' | null;
  onToggleAssist: () => void;
  onRestart: () => void;
  onClear: () => void;
  onClose: () => void;
  onRequestCloseMenu: () => void;
}

export function TerminalActionMenuDropdown({
  llmAssistAutoEnabled,
  llmCliActive,
  detectedCli,
  onToggleAssist,
  onRestart,
  onClear,
  onClose,
  onRequestCloseMenu
}: Props): JSX.Element {
  return (
    <div className="absolute right-0 top-full mt-1 min-w-[220px] rounded-lg border border-line bg-bg-panel shadow-premium p-1 z-20 animate-fade-in">
      <MenuBtn
        onClick={() => {
          onRequestCloseMenu();
          onToggleAssist();
        }}
      >
        {llmAssistAutoEnabled ? 'Disable LLM @ Assist (auto)' : 'Enable LLM @ Assist (auto)'}
      </MenuBtn>
      <MenuBtn disabled>
        Detected LLM: {llmCliActive ? (detectedCli ?? 'unknown') : 'none'}
      </MenuBtn>
      <MenuBtn
        onClick={() => {
          onRequestCloseMenu();
          onRestart();
        }}
      >
        Restart Session
      </MenuBtn>
      <MenuBtn
        onClick={() => {
          onRequestCloseMenu();
          onClear();
        }}
      >
        Clear Output
      </MenuBtn>
      <MenuBtn
        danger
        onClick={() => {
          onRequestCloseMenu();
          onClose();
        }}
      >
        Close Terminal
      </MenuBtn>
    </div>
  );
}

interface MenuBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function MenuBtn({ children, onClick, disabled, danger }: MenuBtnProps): JSX.Element {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-fg-muted'
          : danger
            ? 'text-danger hover:bg-danger/10'
            : 'text-fg hover:bg-bg-panel-2'
      }`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface HeaderButtonsProps {
  browserWindowOpen: boolean;
  onOpenBrowser: () => void;
  onToggleMenu: () => void;
}

export function TerminalHeaderButtons({ browserWindowOpen, onOpenBrowser, onToggleMenu }: HeaderButtonsProps): JSX.Element {
  return (
    <>
      <button
        className="h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={browserWindowOpen ? 'Browser window already open for this terminal' : 'Open browser pane'}
        aria-label="Open browser pane"
        disabled={browserWindowOpen}
        onClick={(event) => {
          event.stopPropagation();
          onOpenBrowser();
        }}
      >
        <Icon name="globe" size="sm" />
      </button>
      <button
        className="h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
        title="Terminal actions"
        aria-label="Terminal actions"
        onClick={onToggleMenu}
      >
        <Icon name="ellipsis" size="sm" />
      </button>
    </>
  );
}
