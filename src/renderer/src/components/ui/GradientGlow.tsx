import { type ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

interface GradientGlowProps {
  children?: ReactNode;
  className?: string;
  /** @deprecated kept for backwards compat, no-op */
  intensity?: 'subtle' | 'medium' | 'strong';
  /** @deprecated kept for backwards compat, no-op */
  animate?: boolean;
}

export function GradientGlow({ children, className }: GradientGlowProps): JSX.Element {
  return <div className={cn('relative', className)}>{children}</div>;
}

export function BrandMark({ size = 16, className }: { size?: number; className?: string }): JSX.Element {
  return <Icon name="bolt" size={size} className={cn('text-primary', className)} />;
}
