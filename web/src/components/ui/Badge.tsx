import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children?: ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface-800/70 text-surface-300 border-surface-700/80',
  info: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
  success: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  warning: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  danger: 'bg-red-400/10 text-red-300 border-red-400/20',
};

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  const base = 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] border font-medium tracking-wide';
  return <span className={`${base} ${VARIANTS[variant]} ${className ?? ''}`}>{children}</span>;
}
