import { forwardRef, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, ...rest },
  ref,
) {
  const base =
    'w-full bg-surface-900/70 border rounded-lg px-3.5 py-2 text-sm text-surface-100 ' +
    'placeholder:text-surface-500 focus:outline-none focus:ring-2 ' +
    'focus:ring-brand-500/20 focus:border-brand-500/70 transition-all duration-200';

  const borderClass = error ? 'border-red-500/70' : 'border-surface-700/80';

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-surface-400">{label}</label>}
      <input ref={ref} className={`${base} ${borderClass} ${className ?? ''}`} {...rest} />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
});
