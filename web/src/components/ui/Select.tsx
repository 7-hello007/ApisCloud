import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, className, ...rest },
  ref,
) {
  const base =
    'w-full bg-surface-900/70 border border-surface-700/80 rounded-lg px-3.5 py-2 text-sm text-surface-100 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/70 transition-all duration-200';

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-surface-400">{label}</label>}
      <select ref={ref} className={`${base} ${className ?? ''}`} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});
