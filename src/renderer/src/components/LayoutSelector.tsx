import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LAYOUT_PRESETS, getPresetById, type LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { Icon, cn } from './ui';

type LayoutSelectorPlacement = 'bottom-end' | 'right-start';

interface LayoutSelectorProps {
  showLabel?: boolean;
  className?: string;
  placement?: LayoutSelectorPlacement;
}

interface FloatingMenuPosition {
  top: number;
  left: number;
}

const MENU_WIDTH = 250;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

export function LayoutSelector({
  showLabel = false,
  className,
  placement = 'bottom-end'
}: LayoutSelectorProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null);
  const appState = useWorkspaceStore((s) => s.appState);
  const ui = useWorkspaceStore((s) => s.ui);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const addToast = useToastStore((s) => s.addToast);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const subscription = normalizeSubscriptionState(appState.subscription);
  const maxPanes = SUBSCRIPTION_PLANS[subscription.tier].limits.maxPanesPerWorkspace;

  const activePresetId = useMemo<LayoutPresetId>(() => {
    const activeId = appState.activeWorkspaceId;
    if (!activeId) {
      return '1-pane';
    }
    return ui.layoutPresetByWorkspace[activeId] ?? '1-pane';
  }, [appState.activeWorkspaceId, ui.layoutPresetByWorkspace]);

  const activePreset = getPresetById(activePresetId);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = (): void => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = placement === 'right-start'
        ? rect.right + MENU_GAP
        : rect.right - MENU_WIDTH;
      let top = placement === 'right-start'
        ? rect.top
        : rect.bottom + MENU_GAP;

      left = Math.min(left, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING);
      left = Math.max(VIEWPORT_PADDING, left);

      if (placement === 'right-start' && menuHeight > 0) {
        top = Math.min(top, viewportHeight - menuHeight - VIEWPORT_PADDING);
      }
      top = Math.max(VIEWPORT_PADDING, top);

      setMenuPosition({ top, left });
    };

    updatePosition();

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, placement]);

  const menu = open ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[60] w-[220px] rounded border border-line bg-bg-panel shadow-premium p-0.5"
      style={menuPosition ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px` } : undefined}
    >
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-fg-muted">
        Layout Presets
      </div>
      {LAYOUT_PRESETS.map((preset) => {
        const locked = maxPanes !== null && preset.slots > maxPanes;
        const active = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-2 py-1 rounded-sm text-left transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-fg hover:bg-bg-panel-2',
              locked && !active && 'opacity-60'
            )}
            onClick={() => {
              if (locked) {
                addToast('info', `Spark supports up to ${maxPanes} panes. Upgrade to unlock larger layouts.`);
                return;
              }
              setLayoutPreset(preset.id);
              setOpen(false);
            }}
          >
            <span className="text-xs font-medium">{preset.label}</span>
            <span className="flex items-center gap-1 text-[10px] text-fg-muted">
              {preset.slots} panes
              {locked && <Icon name="lock" size="xs" className="text-warn" />}
              {active && <Icon name="check" size="xs" className="text-primary" />}
            </span>
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        className={cn(
          'h-6 px-1.5 inline-flex items-center gap-1 rounded-sm text-[11px] font-medium transition-colors',
          'text-fg-muted hover:text-fg hover:bg-bg-panel-2',
          open && 'bg-bg-panel-2 text-fg'
        )}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={`Layout: ${activePreset.label}`}
        aria-label={`Layout: ${activePreset.label}`}
      >
        <Icon name="layout" size="md" />
        {showLabel && <span>Layouts</span>}
      </button>
      {menu}
    </div>
  );
}
