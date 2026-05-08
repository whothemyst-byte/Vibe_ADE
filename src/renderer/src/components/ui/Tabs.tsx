import { type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline' | 'segment';
  className?: string;
  fullWidth?: boolean;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'pill',
  className,
  fullWidth
}: TabsProps): JSX.Element {
  if (variant === 'segment') {
    return (
      <div
        className={cn(
          'inline-flex p-0.5 bg-bg-panel-2 border border-line rounded',
          fullWidth && 'w-full',
          className
        )}
      >
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1 h-6 px-2 rounded-sm text-[11px] font-medium transition-colors',
                active ? 'bg-bg-elev text-fg' : 'text-fg-muted hover:text-fg',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div className={cn('flex items-center gap-0 border-b border-line', className)}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium transition-colors relative',
                active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {item.icon}
              {item.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-primary" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2 rounded-sm text-[11px] font-medium transition-colors',
              active
                ? 'bg-bg-elev text-fg'
                : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2',
              item.disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
