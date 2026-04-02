import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LAYOUT_PRESETS, getPresetById, type LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { UiIcon } from './UiIcon';

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
      className="layout-selector-menu"
      role="menu"
      style={menuPosition ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px` } : undefined}
    >
      {LAYOUT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          className={
            preset.id === activePresetId
              ? 'layout-option active'
              : maxPanes !== null && preset.slots > maxPanes
                ? 'layout-option locked'
                : 'layout-option'
          }
          onClick={() => {
            if (maxPanes !== null && preset.slots > maxPanes) {
              addToast('info', `Spark supports up to ${maxPanes} panes. Upgrade to unlock larger layouts.`);
              return;
            }
            setLayoutPreset(preset.id);
            setOpen(false);
          }}
        >
          <span>{preset.label}</span>
          <small>
            {preset.slots} panes
            {maxPanes !== null && preset.slots > maxPanes && (
              <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />
            )}
          </small>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={rootRef} className={className ? `layout-selector ${className}` : 'layout-selector'}>
      <button
        ref={buttonRef}
        className="top-button icon-top-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={`Layout: ${activePreset.label}`}
        aria-label={`Layout: ${activePreset.label}`}
      >
        <UiIcon name="layout" className="ui-icon" />
        {showLabel && <span>Layouts</span>}
      </button>
      {menu}
    </div>
  );
}
