import { useEffect, type ReactNode, type MouseEvent } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  dismissable?: boolean;
}

const sizes = {
  sm: 'max-w-xs',
  md: 'max-w-sm',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-[85vw] max-h-[85vh]'
} as const;

export function Dialog({
  open,
  onClose,
  children,
  className,
  size = 'md',
  dismissable = true
}: DialogProps): JSX.Element | null {
  useEffect(() => {
    if (!open || !dismissable) return;
    const handleEsc = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>): void => {
    if (dismissable && event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      onClick={handleBackdrop}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={cn(
          'relative w-full bg-bg-panel border border-line rounded shadow-premium overflow-hidden',
          sizes[size],
          className
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  icon?: ReactNode;
}

export function DialogHeader({ title, subtitle, onClose, icon }: DialogHeaderProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 h-7 border-b border-line bg-bg-panel-2">
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <span className="text-fg-muted shrink-0">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 className="text-xs font-medium text-fg truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-fg-muted truncate">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="h-5 w-5 rounded-sm grid place-items-center text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors shrink-0"
        >
          <Icon name="close" size="sm" />
        </button>
      )}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return <div className={cn('px-3 py-3 text-xs', className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <div className={cn('px-3 py-2 border-t border-line bg-bg-panel-2 flex items-center justify-end gap-1.5', className)}>
      {children}
    </div>
  );
}
