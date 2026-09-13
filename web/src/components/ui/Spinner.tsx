export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-3 h-3 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-[3px]',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      className={`inline-block ${SIZES[size]} border-current border-t-transparent rounded-full animate-spin ${className ?? ''}`}
      aria-label="loading"
    />
  );
}
