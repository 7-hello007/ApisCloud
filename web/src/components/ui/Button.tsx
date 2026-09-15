import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-950 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500',
    secondary:
      'bg-surface-800 text-surface-100 hover:bg-surface-700 focus:ring-surface-600 border border-surface-700',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'bg-transparent text-surface-200 hover:bg-surface-800 focus:ring-surface-700',
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-1.5 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
