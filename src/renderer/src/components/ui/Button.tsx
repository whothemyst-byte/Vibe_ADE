import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** @deprecated kept for backwards compat, no-op */
  glow?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong border border-primary-strong/60',
  secondary: 'bg-bg-panel-2 text-fg hover:bg-bg-elev border border-line',
  ghost: 'bg-transparent text-fg hover:bg-bg-panel-2 border border-transparent',
  outline: 'bg-transparent text-fg border border-line hover:border-line-strong',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent'
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-[11px] gap-1',
  md: 'h-7 px-2.5 text-xs gap-1.5',
  lg: 'h-8 px-3 text-xs gap-1.5',
  icon: 'h-7 w-7 p-0 grid place-items-center'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, disabled, ...rest },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  )
);
Button.displayName = 'Button';
