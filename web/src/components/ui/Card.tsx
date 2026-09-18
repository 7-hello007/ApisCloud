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
  const base =
    'bg-surface-900/75 border border-surface-800/90 rounded-xl overflow-hidden shadow-[0_8px_32px_rgb(0_0_0_/_0.12)] backdrop-blur-xl';
  const bodyPad = padded ? 'p-5' : '';

  const hasHeader = title || subtitle || actions;

  return (
    <div className={`${base} ${className ?? ''}`} {...rest}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-surface-800/80 bg-surface-900/30">
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold text-surface-100 truncate">{title}</div>}
            {subtitle && <div className="text-[11px] text-surface-500 mt-1 truncate font-mono">{subtitle}</div>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyPad}>{children}</div>
    </div>
  );
}
