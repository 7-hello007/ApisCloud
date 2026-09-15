import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
}

export function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  const base = 'bg-surface-900 border border-surface-800 rounded-lg overflow-hidden';
  const bodyPad = padded ? 'p-5' : '';

  const hasHeader = title || subtitle || actions;

  return (
    <div className={`${base} ${className ?? ''}`} {...rest}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 px-5 py-3 border-b border-surface-800">
          <div className="min-w-0">
            {title && <div className="text-sm font-medium text-surface-100 truncate">{title}</div>}
            {subtitle && <div className="text-xs text-surface-400 mt-0.5 truncate">{subtitle}</div>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyPad}>{children}</div>
    </div>
  );
}
