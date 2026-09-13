import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children?: ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface-800 text-surface-200 border-surface-700',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  const base =
    'inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium';
  return (
    <span className={`${base} ${VARIANTS[variant]} ${className ?? ''}`}>{children}</span>
  );
}
