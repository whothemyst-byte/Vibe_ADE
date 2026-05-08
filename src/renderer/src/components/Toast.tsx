import { useToastStore } from '@renderer/hooks/useToast';
import { Icon, cn } from './ui';

const TOAST_STYLES = {
  success: { border: 'border-success/40', bg: 'bg-success/10', icon: 'check_circle', iconColor: 'text-success' },
  error: { border: 'border-danger/40', bg: 'bg-danger/10', icon: 'error', iconColor: 'text-danger' },
  warning: { border: 'border-warn/40', bg: 'bg-warn/10', icon: 'warning', iconColor: 'text-warn' },
  info: { border: 'border-primary/40', bg: 'bg-primary/10', icon: 'info', iconColor: 'text-primary' }
} as const;

export function ToastContainer(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) {
    return <></>;
  }

  return (
    <div className="fixed bottom-2 right-2 z-[60] flex flex-col gap-1.5 max-w-xs w-full pointer-events-none">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] ?? TOAST_STYLES.info;
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto group relative flex items-start gap-2 px-2.5 py-2 rounded border',
              'bg-bg-panel shadow-premium cursor-pointer',
              style.border
            )}
            onClick={() => removeToast(toast.id)}
          >
            <div className={cn('shrink-0', style.iconColor)}>
              <Icon name={style.icon} size="xs" />
            </div>
            <div className="flex-1 min-w-0">
              {toast.title && (
                <div className="text-[11px] font-medium text-fg truncate">{toast.title}</div>
              )}
              <div className="text-[11px] text-fg-muted leading-snug break-words">{toast.message}</div>
            </div>
            <button
              className="shrink-0 h-4 w-4 grid place-items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              aria-label="Close"
            >
              <Icon name="close" size="xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
