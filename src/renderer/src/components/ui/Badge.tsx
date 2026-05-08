import { type HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warn' | 'danger' | 'outline';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-bg-panel-2 text-fg-muted border-line',
  primary: 'bg-primary/15 text-primary border-primary/30',
  success: 'bg-success/15 text-success border-success/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  outline: 'bg-transparent text-fg-muted border-line'
};

export function Badge({ className, variant = 'neutral', dot, children, ...rest }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 h-4 rounded-sm border text-[10px] font-medium',
        variants[variant],
        className
      )}
      {...rest}
    >
      {dot && <span className="h-1 w-1 rounded-full bg-current" />}
      {children}
    </span>
  );
}
