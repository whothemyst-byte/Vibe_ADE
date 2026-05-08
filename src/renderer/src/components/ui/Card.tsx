import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from './cn';

export type CardVariant = 'default' | 'glass' | 'elevated' | 'interactive';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** @deprecated kept for backwards compat, no-op */
  glow?: boolean;
}

const variants: Record<CardVariant, string> = {
  default: 'bg-bg-panel border border-line rounded',
  glass: 'bg-bg-panel border border-line rounded',
  elevated: 'bg-bg-elev border border-line rounded',
  interactive:
    'bg-bg-panel border border-line rounded transition-colors hover:border-line-strong cursor-pointer'
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...rest }, ref) => (
    <div ref={ref} className={cn(variants[variant], className)} {...rest}>
      {children}
    </div>
  )
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('px-3 pt-2.5 pb-2 flex items-start justify-between gap-2', className)} {...rest} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...rest }, ref) => (
    <h3 ref={ref} className={cn('text-xs font-medium text-fg', className)} {...rest} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...rest }, ref) => (
    <p ref={ref} className={cn('text-[11px] text-fg-muted leading-snug', className)} {...rest} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => <div ref={ref} className={cn('px-3 pb-3', className)} {...rest} />
);
CardBody.displayName = 'CardBody';

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('px-3 py-2 border-t border-line flex items-center justify-end gap-1.5', className)} {...rest} />
  )
);
CardFooter.displayName = 'CardFooter';
