import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, invalid, ...rest }, ref) => (
    <div className="relative">
      {leftIcon && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none [&_i]:text-[14px]">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full h-7 rounded bg-bg-panel-2 border border-line text-fg placeholder:text-fg-muted',
          'px-2 text-xs outline-none transition-colors',
          'focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          leftIcon && 'pl-7',
          rightIcon && 'pr-7',
          invalid && 'border-danger',
          className
        )}
        {...rest}
      />
      {rightIcon && <span className="absolute right-1 top-1/2 -translate-y-1/2">{rightIcon}</span>}
    </div>
  )
);
Input.displayName = 'Input';

interface LabelProps {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function Label({ children, htmlFor, className }: LabelProps): JSX.Element {
  return (
    <label htmlFor={htmlFor} className={cn('block text-[11px] font-medium text-fg-muted mb-1', className)}>
      {children}
    </label>
  );
}
